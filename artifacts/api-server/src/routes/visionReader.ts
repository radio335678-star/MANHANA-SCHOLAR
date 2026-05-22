import { Router, type IRouter } from "express";
import multer from "multer";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  visionReaderSessionsTable,
  vaultResourcesTable,
  workspacesTable,
  eq,
  and,
  desc,
} from "@workspace/db";
import { requireAuth, requireDbUser } from "../lib/auth";
import { runVisionRead, DEFAULT_VISION_PROMPT } from "../lib/visionAgent";
import type { KimiStreamEvent } from "../lib/kimiModelRouter";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Multer — 10 files max, 25 MB each ────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

// ── Allowed extensions ────────────────────────────────────────────────────────
const ALLOWED_EXTS = new Set([
  ".pdf", ".doc", ".docx", ".xlsx", ".xls", ".csv", ".ppt", ".pptx", ".txt",
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".tif",
]);

function allowedExt(filename: string): boolean {
  const i = filename.lastIndexOf(".");
  return i >= 0 && ALLOWED_EXTS.has(filename.slice(i).toLowerCase());
}

// ── Ownership guard ───────────────────────────────────────────────────────────
async function verifyWorkspaceOwner(
  workspaceId: number,
  userId: number,
): Promise<boolean> {
  const [ws] = await db
    .select({ userId: workspacesTable.userId })
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);
  return ws?.userId === userId;
}

// ── FlushableResponse helper ──────────────────────────────────────────────────
type FlushableResponse = typeof import("express").response & { flush?: () => void };

// ─────────────────────────────────────────────────────────────────────────────
// POST /workspaces/:workspaceId/vision-reader/analyze/stream
//   multipart: up to 10 files + optional field "prompt"
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/workspaces/:workspaceId/vision-reader/analyze/stream",
  requireAuth,
  upload.array("files", 10),
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    if (!(await verifyWorkspaceOwner(workspaceId, dbUser.id))) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    const rawFiles = (req.files ?? []) as Express.Multer.File[];
    if (rawFiles.length === 0) {
      res.status(400).json({ error: "No files uploaded." });
      return;
    }

    const invalidFiles = rawFiles.filter((f) => !allowedExt(f.originalname));
    if (invalidFiles.length > 0) {
      res.status(400).json({
        error: `Unsupported file type(s): ${invalidFiles.map((f) => f.originalname).join(", ")}`,
      });
      return;
    }

    const userPrompt = (typeof req.body?.prompt === "string" && req.body.prompt.trim())
      ? req.body.prompt.trim()
      : DEFAULT_VISION_PROMPT;

    const [wsRow] = await db
      .select({ domain: workspacesTable.domain })
      .from(workspacesTable)
      .where(eq(workspacesTable.id, workspaceId))
      .limit(1);
    const workspaceDomain = wsRow?.domain ?? "Allopathy";

    // ── Start SSE stream ──────────────────────────────────────────────────────
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(`: ${" ".repeat(2048)}\n\n`);

    const send = (event: Record<string, unknown>) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        (res as unknown as FlushableResponse).flush?.();
      } catch {
        // client disconnected
      }
    };

    send({ type: "ping" });

    const heartbeat = setInterval(() => send({ type: "ping" }), 8_000);

    let outputText = "";
    let thinkingText = "";
    let tokensUsed = 0;
    let modelUsed = "";
    let runError: string | undefined;

    try {
      const files = rawFiles.map((f) => ({
        buffer: f.buffer,
        name: f.originalname,
        mimeType: f.mimetype,
      }));

      send({ type: "files_accepted", count: files.length, names: files.map((f) => f.name) });

      const onStream = (event: KimiStreamEvent) => {
        if (event.type === "token") {
          outputText += event.content;
          send({ type: "token", content: event.content });
        } else if (event.type === "thinking") {
          thinkingText += event.content;
          // Kimi thinking models stream the answer in reasoning_content — mirror to content channel for the UI.
          outputText += event.content;
          send({ type: "thinking", content: event.content });
          send({ type: "token", content: event.content });
        }
      };

      const result = await runVisionRead({
        files,
        prompt: userPrompt,
        domain: workspaceDomain,
        onStream,
      });
      outputText = result.text || outputText || thinkingText;
      thinkingText = result.thinkingText || thinkingText;
      tokensUsed = result.tokensUsed;
      modelUsed = result.modelUsed;

      // Persist session
      const [session] = await db
        .insert(visionReaderSessionsTable)
        .values({
          workspaceId,
          userId: dbUser.id,
          filesInfo: result.fileRefs,
          outputText: outputText || null,
          userPrompt: userPrompt !== DEFAULT_VISION_PROMPT ? userPrompt : null,
          modelUsed,
          tokensUsed,
        })
        .returning({ id: visionReaderSessionsTable.id });

      if (!outputText.trim()) {
        logger.warn(
          { workspaceId, fileCount: files.length, tokensUsed, modelUsed },
          "Vision reader finished with empty output",
        );
      }

      send({
        type: "done",
        sessionId: session?.id,
        totalTokens: tokensUsed,
        modelUsed,
        content: outputText,
      });
    } catch (err) {
      runError = err instanceof Error ? err.message : "Vision read failed";
      logger.error({ err, workspaceId }, "Vision reader stream error");
      send({ type: "error", message: runError });
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /workspaces/:workspaceId/vision-reader/sessions — last 20 sessions
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/workspaces/:workspaceId/vision-reader/sessions",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    if (!(await verifyWorkspaceOwner(workspaceId, dbUser.id))) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    const sessions = await db
      .select({
        id: visionReaderSessionsTable.id,
        filesInfo: visionReaderSessionsTable.filesInfo,
        outputText: visionReaderSessionsTable.outputText,
        userPrompt: visionReaderSessionsTable.userPrompt,
        tokensUsed: visionReaderSessionsTable.tokensUsed,
        modelUsed: visionReaderSessionsTable.modelUsed,
        createdAt: visionReaderSessionsTable.createdAt,
      })
      .from(visionReaderSessionsTable)
      .where(eq(visionReaderSessionsTable.workspaceId, workspaceId))
      .orderBy(desc(visionReaderSessionsTable.createdAt))
      .limit(20);

    res.json(sessions.map((s) => ({
      id: s.id,
      filesInfo: s.filesInfo ?? [],
      outputText: s.outputText ?? "",
      outputPreview: s.outputText ? s.outputText.slice(0, 120) : "",
      userPrompt: s.userPrompt,
      tokensUsed: s.tokensUsed,
      modelUsed: s.modelUsed,
      createdAt: s.createdAt.toISOString(),
    })));
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /workspaces/:workspaceId/vision-reader/sessions/:sessionId
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/workspaces/:workspaceId/vision-reader/sessions/:sessionId",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const sessionId = parseInt(String(req.params.sessionId), 10);

    const [session] = await db
      .select()
      .from(visionReaderSessionsTable)
      .where(
        and(
          eq(visionReaderSessionsTable.id, sessionId),
          eq(visionReaderSessionsTable.workspaceId, workspaceId),
          eq(visionReaderSessionsTable.userId, dbUser.id),
        ),
      )
      .limit(1);

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    res.json({
      id: session.id,
      filesInfo: session.filesInfo ?? [],
      outputText: session.outputText ?? "",
      userPrompt: session.userPrompt,
      tokensUsed: session.tokensUsed,
      modelUsed: session.modelUsed,
      createdAt: session.createdAt.toISOString(),
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /workspaces/:workspaceId/vision-reader/sessions/:sessionId/vault-save
// ─────────────────────────────────────────────────────────────────────────────
const VaultSaveBody = z.object({
  title: z.string().min(1).max(200).optional(),
});

router.post(
  "/workspaces/:workspaceId/vision-reader/sessions/:sessionId/vault-save",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const sessionId = parseInt(String(req.params.sessionId), 10);

    const body = VaultSaveBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [session] = await db
      .select()
      .from(visionReaderSessionsTable)
      .where(
        and(
          eq(visionReaderSessionsTable.id, sessionId),
          eq(visionReaderSessionsTable.workspaceId, workspaceId),
          eq(visionReaderSessionsTable.userId, dbUser.id),
        ),
      )
      .limit(1);

    if (!session || !session.outputText) {
      res.status(404).json({ error: "Session not found or has no output" });
      return;
    }

    const fileNames = (session.filesInfo ?? []).map((f) => f.name).join(", ") || "documents";
    const defaultTitle = `Vision Read — ${fileNames.slice(0, 80)}`;

    const [vault] = await db
      .insert(vaultResourcesTable)
      .values({
        workspaceId,
        type: "note",
        title: body.data.title ?? defaultTitle,
        content: session.outputText,
        tags: "vision-reader,ai-extracted",
      })
      .returning({ id: vaultResourcesTable.id });

    logger.info({ sessionId, vaultId: vault?.id, workspaceId }, "Vision session saved to vault");

    res.json({ ok: true, vaultResourceId: vault?.id });
  },
);

export default router;
