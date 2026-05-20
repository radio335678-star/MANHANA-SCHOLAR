import { Router, type IRouter } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import {
  chatMessagesTable,
  sectionsTable,
  workspacesTable,
  usersTable,
  activityEventsTable,
  eq,
} from "@workspace/db";
import { requireAuth, requireDbUser } from "../lib/auth";
import { chat } from "../lib/kimi";
import { buildThesisSectionSystemPrompt } from "../lib/thesisAgentPrompt";
import { finalizeAiContent } from "../lib/finalizeAiContent";
import { assertAiAllowed, getWorkspaceAiContext } from "../lib/workspaceContext";
import { catalogToArray } from "@workspace/vault-citations";
import { runThesisSectionAgent } from "../services/thesisSectionAgent";
import { uploadBuffer, isStorageConfigured } from "../lib/supabaseStorage";
import { extractDatasetContextText } from "../lib/contextExtract";
import {
  ListChatMessagesParams,
  ListChatMessagesResponse,
  SendChatMessageParams,
  SendChatMessageBody,
  SendChatMessageResponse,
  ClearChatHistoryParams,
  GenerateSectionContentParams,
  GenerateSectionContentBody,
  GenerateSectionContentResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const chatAttachments = new Map<string, string>();

function msgToResponse(m: typeof chatMessagesTable.$inferSelect) {
  return {
    ...m,
    createdAt: m.createdAt.toISOString(),
    tokensUsed: m.tokensUsed ?? null,
  };
}

async function verifyAccess(workspaceId: number, sectionId: number, userId: number) {
  const [ws] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);
  if (!ws || ws.userId !== userId) return null;

  const [sec] = await db
    .select()
    .from(sectionsTable)
    .where(eq(sectionsTable.id, sectionId))
    .limit(1);
  if (!sec || sec.workspaceId !== workspaceId) return null;

  return { ws, sec };
}

function attachmentKey(workspaceId: number, sectionId: number): string {
  return `${workspaceId}:${sectionId}`;
}

router.get(
  "/workspaces/:workspaceId/sections/:sectionId/chat",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const params = ListChatMessagesParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const access = await verifyAccess(params.data.workspaceId, params.data.sectionId, dbUser.id);
    if (!access) { res.status(404).json({ error: "Not found" }); return; }

    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.sectionId, params.data.sectionId))
      .orderBy(chatMessagesTable.createdAt)
      .limit(50);

    res.json(ListChatMessagesResponse.parse(messages.map(msgToResponse)));
  },
);

router.post(
  "/workspaces/:workspaceId/sections/:sectionId/chat/upload",
  requireAuth,
  upload.single("file"),
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const sectionId = parseInt(String(req.params.sectionId), 10);
    if (isNaN(workspaceId) || isNaN(sectionId)) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }

    const access = await verifyAccess(workspaceId, sectionId, dbUser.id);
    if (!access) { res.status(404).json({ error: "Not found" }); return; }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    let extractedText = "";
    try {
      extractedText = await extractDatasetContextText(file.buffer, file.mimetype, file.originalname);
    } catch {
      extractedText = `[File: ${file.originalname}]`;
    }

    if (isStorageConfigured()) {
      const path = `chat-attachments/${workspaceId}/${sectionId}/${Date.now()}-${file.originalname}`;
      await uploadBuffer(path, file.buffer, file.mimetype, "vault");
    }

    const key = attachmentKey(workspaceId, sectionId);
    const existing = chatAttachments.get(key) ?? "";
    chatAttachments.set(
      key,
      `${existing}\n\n--- ${file.originalname} ---\n${extractedText}`.trim(),
    );

    res.json({
      fileName: file.originalname,
      mimeType: file.mimetype,
      extractedPreview: extractedText.slice(0, 500),
    });
  },
);

router.post(
  "/workspaces/:workspaceId/sections/:sectionId/chat/stream",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const sectionId = parseInt(String(req.params.sectionId), 10);
    if (isNaN(workspaceId) || isNaN(sectionId)) { res.status(400).json({ error: "Invalid params" }); return; }

    const body = SendChatMessageBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const access = await verifyAccess(workspaceId, sectionId, dbUser.id);
    if (!access) { res.status(404).json({ error: "Not found" }); return; }

    try {
      await assertAiAllowed(workspaceId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "AI not allowed" });
      return;
    }

    const aiCtx = await getWorkspaceAiContext(workspaceId);

    await db.insert(chatMessagesTable).values({
      sectionId,
      role: "user",
      content: body.data.content,
    });

    const historyRows = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.sectionId, sectionId))
      .orderBy(chatMessagesTable.createdAt)
      .limit(20);

    const [userProfile] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, dbUser.id))
      .limit(1);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const attachmentContext = chatAttachments.get(attachmentKey(workspaceId, sectionId));

    let fullContent = "";
    let totalTokens = 0;

    try {
      const result = await runThesisSectionAgent({
        workspaceId,
        sectionId,
        userMessage: body.data.content,
        mode: "chat",
        aiCtx,
        workspace: access.ws,
        section: access.sec,
        userProfile,
        history: historyRows.slice(0, -1).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        attachmentContext,
        onEvent: (event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          if (event.type === "token") fullContent += event.content;
          if (event.type === "section_updated") fullContent = event.content;
          if (event.type === "done") {
            fullContent = event.content || fullContent;
            totalTokens = event.totalTokens;
          }
        },
      });

      fullContent = result.content || fullContent;
      totalTokens = result.totalTokens;

      const finalized = finalizeAiContent(fullContent, aiCtx.vaultCatalog, {
        appendReferences: true,
        expandInline: false,
      });

      res.write(
        `data: ${JSON.stringify({
          type: "done",
          content: finalized.raw,
          totalTokens,
          citedKeys: finalized.citedKeys,
          unknownKeys: finalized.unknownKeys,
          vaultResourceCount: aiCtx.vaultResourceCount,
          vaultCatalog: catalogToArray(aiCtx.vaultCatalog),
        })}\n\n`,
      );

      await db.insert(chatMessagesTable).values({
        sectionId,
        role: "assistant",
        content: finalized.raw,
        tokensUsed: totalTokens,
      });
    } catch {
      const errMsg = "AI request failed. Please try again.";
      res.write(`data: ${JSON.stringify({ type: "error", message: errMsg })}\n\n`);
      await db.insert(chatMessagesTable).values({ sectionId, role: "assistant", content: errMsg, tokensUsed: 0 });
    }

    res.end();
  },
);

router.post(
  "/workspaces/:workspaceId/sections/:sectionId/generate/stream",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const sectionId = parseInt(String(req.params.sectionId), 10);
    if (isNaN(workspaceId) || isNaN(sectionId)) { res.status(400).json({ error: "Invalid params" }); return; }

    const body = GenerateSectionContentBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const access = await verifyAccess(workspaceId, sectionId, dbUser.id);
    if (!access) { res.status(404).json({ error: "Not found" }); return; }

    try {
      await assertAiAllowed(workspaceId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "AI not allowed" });
      return;
    }

    const aiCtx = await getWorkspaceAiContext(workspaceId);

    const [userProfile] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, dbUser.id))
      .limit(1);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let fullContent = "";
    let totalTokens = 0;

    try {
      const targetPages = access.sec.targetPages;
      const wordLimit = body.data.wordLimit ?? (targetPages ? targetPages * 250 : 1500);

      const result = await runThesisSectionAgent({
        workspaceId,
        sectionId,
        userMessage: body.data.prompt,
        mode: "generate",
        aiCtx,
        workspace: access.ws,
        section: { ...access.sec, targetPages: targetPages ?? Math.ceil(wordLimit / 250) },
        userProfile,
        onEvent: (event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          if (event.type === "token") fullContent += event.content;
          if (event.type === "section_updated") fullContent = event.content;
          if (event.type === "done") {
            fullContent = event.content || fullContent;
            totalTokens = event.totalTokens;
          }
        },
      });

      fullContent = result.content || fullContent;
      totalTokens = result.totalTokens;

      const finalized = finalizeAiContent(fullContent, aiCtx.vaultCatalog, {
        appendReferences: true,
        expandInline: false,
      });

      if (!access.sec.content && finalized.raw) {
        const { markdownToHtml } = await import("../lib/markdownToHtml");
        await db
          .update(sectionsTable)
          .set({
            content: markdownToHtml(finalized.raw),
            status: "in_progress",
            wordCount: finalized.raw.split(/\s+/).filter(Boolean).length,
            updatedAt: new Date(),
          })
          .where(eq(sectionsTable.id, sectionId));
      }

      res.write(
        `data: ${JSON.stringify({
          type: "done",
          totalTokens,
          content: finalized.raw,
          expandedContent: finalized.expanded,
          citedKeys: finalized.citedKeys,
          unknownKeys: finalized.unknownKeys,
          vaultResourceCount: aiCtx.vaultResourceCount,
          vaultCatalog: catalogToArray(aiCtx.vaultCatalog),
        })}\n\n`,
      );

      await db.insert(activityEventsTable).values({
        userId: dbUser.id,
        workspaceId: access.ws.id,
        type: "content_generated",
        description: `AI generated content for "${access.sec.title}" in "${access.ws.title}"`,
      });
    } catch {
      res.write(`data: ${JSON.stringify({ type: "error", message: "AI generation failed. Please try again." })}\n\n`);
    }

    res.end();
  },
);

router.post(
  "/workspaces/:workspaceId/sections/:sectionId/chat",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const params = SendChatMessageParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const body = SendChatMessageBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const access = await verifyAccess(params.data.workspaceId, params.data.sectionId, dbUser.id);
    if (!access) { res.status(404).json({ error: "Not found" }); return; }

    try {
      await assertAiAllowed(params.data.workspaceId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "AI not allowed" });
      return;
    }

    const aiCtx = await getWorkspaceAiContext(params.data.workspaceId);

    await db.insert(chatMessagesTable).values({
      sectionId: params.data.sectionId,
      role: "user",
      content: body.data.content,
    });

    const historyRows = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.sectionId, params.data.sectionId))
      .orderBy(chatMessagesTable.createdAt)
      .limit(20);

    const [userProfile] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, dbUser.id))
      .limit(1);

    const systemPrompt = buildThesisSectionSystemPrompt({
      qualification: userProfile?.qualification,
      domain: userProfile?.domain,
      thesisTitle: access.ws.title,
      sectionTitle: access.sec.title,
      sectionType: access.sec.type,
      sectionContent: body.data.includeContext !== false ? access.sec.content : null,
      contextBlock: aiCtx.contextBlock || undefined,
      vaultResourceCount: aiCtx.vaultResourceCount,
      targetPages: access.sec.targetPages,
      minPages: access.sec.minPages,
      maxPages: access.sec.maxPages,
    });

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...historyRows.slice(0, -1).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: body.data.content },
    ];

    const aiResponse = await chat(messages);

    const [assistantMsg] = await db
      .insert(chatMessagesTable)
      .values({
        sectionId: params.data.sectionId,
        role: "assistant",
        content: aiResponse.content,
        tokensUsed: aiResponse.tokensUsed,
      })
      .returning();

    res.json(SendChatMessageResponse.parse(msgToResponse(assistantMsg!)));
  },
);

router.delete(
  "/workspaces/:workspaceId/sections/:sectionId/chat/clear",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const params = ClearChatHistoryParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const access = await verifyAccess(params.data.workspaceId, params.data.sectionId, dbUser.id);
    if (!access) { res.status(404).json({ error: "Not found" }); return; }

    await db
      .delete(chatMessagesTable)
      .where(eq(chatMessagesTable.sectionId, params.data.sectionId));

    chatAttachments.delete(attachmentKey(params.data.workspaceId, params.data.sectionId));

    res.sendStatus(204);
  },
);

router.post(
  "/workspaces/:workspaceId/sections/:sectionId/generate",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const params = GenerateSectionContentParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const body = GenerateSectionContentBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const access = await verifyAccess(params.data.workspaceId, params.data.sectionId, dbUser.id);
    if (!access) { res.status(404).json({ error: "Not found" }); return; }

    try {
      await assertAiAllowed(params.data.workspaceId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "AI not allowed" });
      return;
    }

    const aiCtx = await getWorkspaceAiContext(params.data.workspaceId);

    const [userProfile] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, dbUser.id))
      .limit(1);

    const { generateContent } = await import("../lib/kimi");
    const wordLimit = body.data.wordLimit ?? (access.sec.targetPages ? access.sec.targetPages * 250 : 1500);

    const result = await generateContent(body.data.prompt, {
      workspaceTitle: access.ws.title,
      sectionTitle: access.sec.title,
      sectionType: access.sec.type,
      domain: userProfile?.domain ?? access.ws.domain ?? "medicine",
      qualification: userProfile?.qualification ?? access.ws.qualification ?? "MD",
      tone: body.data.tone ?? "academic",
      wordLimit,
      contextBlock: aiCtx.contextBlock,
      vaultResourceCount: aiCtx.vaultResourceCount,
    });

    const finalized = finalizeAiContent(result.content, aiCtx.vaultCatalog);

    await db.insert(activityEventsTable).values({
      userId: dbUser.id,
      workspaceId: access.ws.id,
      type: "content_generated",
      description: `AI generated content for "${access.sec.title}" in "${access.ws.title}"`,
    });

    res.json(
      GenerateSectionContentResponse.parse({
        content: finalized.raw,
        tokensUsed: result.tokensUsed,
      }),
    );
  },
);

export default router;
