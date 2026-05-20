import { Router, type IRouter } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  workspacesTable,
  preThesisChatMessagesTable,
  preThesisConflictsTable,
  eq,
  and,
  desc,
} from "@workspace/db";
import { requireAuth, requireDbUser } from "../lib/auth";
import { isWorkflowState } from "../types/workflow";
import { PreThesisDocumentV2Schema } from "../types/preThesisDocumentV2";
import { runPreThesisAgentChat } from "../lib/kimiK2Agent";
import { undoLastAiRevision, getLatestBuildJob } from "../services/preThesisPatch";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const SendBody = z.object({
  content: z.string().min(1).max(8000),
});

async function verifyPreThesisChatAccess(workspaceId: number, userId: number) {
  const [ws] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);

  if (!ws || ws.userId !== userId) return null;

  const state = isWorkflowState(ws.workflowState) ? ws.workflowState : "init";
  if (ws.preThesisMdHash || state === "locked_in") {
    return { error: "locked" as const, ws: null };
  }
  if (state !== "pre_setup" && state !== "init" && state !== "created") {
    return { error: "workflow" as const, ws: null };
  }

  const job = await getLatestBuildJob(workspaceId);
  if (!job?.resultJson || job.status !== "completed") {
    return { error: "no_build" as const, ws: null };
  }

  const parsed = PreThesisDocumentV2Schema.safeParse(job.resultJson);
  if (!parsed.success) {
    return { error: "invalid_doc" as const, ws: null };
  }

  return { error: null as null, ws, document: parsed.data, job };
}

router.get("/workspaces/:id/pre-thesis/chat", requireAuth, async (req, res): Promise<void> => {
  const dbUser = await requireDbUser(req, res);
  if (!dbUser) return;

  const workspaceId = parseInt(String(req.params.id), 10);
  const [ws] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);

  if (!ws || ws.userId !== dbUser.id) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }
  if (ws.preThesisMdHash) {
    res.status(403).json({ error: "Pre-thesis is locked" });
    return;
  }

  const messages = await db
    .select()
    .from(preThesisChatMessagesTable)
    .where(eq(preThesisChatMessagesTable.workspaceId, workspaceId))
    .orderBy(preThesisChatMessagesTable.createdAt)
    .limit(50);

  res.json(
    messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      tokensUsed: m.tokensUsed,
    })),
  );
});

router.delete("/workspaces/:id/pre-thesis/chat/clear", requireAuth, async (req, res): Promise<void> => {
  const dbUser = await requireDbUser(req, res);
  if (!dbUser) return;

  const workspaceId = parseInt(String(req.params.id), 10);
  const [ws] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);

  if (!ws || ws.userId !== dbUser.id) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db
    .delete(preThesisChatMessagesTable)
    .where(eq(preThesisChatMessagesTable.workspaceId, workspaceId));

  res.json({ ok: true });
});

router.post(
  "/workspaces/:id/pre-thesis/chat/stream",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.id), 10);
    const body = SendBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const access = await verifyPreThesisChatAccess(workspaceId, dbUser.id);
    if (access.error === "locked") {
      res.status(403).json({ error: "Pre-thesis is locked" });
      return;
    }
    if (access.error === "no_build") {
      res.status(400).json({ error: "Run Build Pre-Thesis before using the assistant" });
      return;
    }
    if (access.error === "invalid_doc") {
      res.status(400).json({ error: "Document schema invalid — rebuild pre-thesis" });
      return;
    }
    if (!access.ws || !access.document) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const ws = access.ws;
    let document = access.document;

    await db.insert(preThesisChatMessagesTable).values({
      workspaceId,
      userId: dbUser.id,
      role: "user",
      content: body.data.content,
    });

    const historyRows = await db
      .select()
      .from(preThesisChatMessagesTable)
      .where(eq(preThesisChatMessagesTable.workspaceId, workspaceId))
      .orderBy(preThesisChatMessagesTable.createdAt)
      .limit(30);

    const history = historyRows
      .slice(0, -1)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const conflicts = await db
      .select()
      .from(preThesisConflictsTable)
      .where(
        and(
          eq(preThesisConflictsTable.workspaceId, workspaceId),
          eq(preThesisConflictsTable.resolved, false),
        ),
      );

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (event: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const { assistantContent, totalTokens } = await runPreThesisAgentChat({
        workspaceId,
        userId: dbUser.id,
        userMessage: body.data.content,
        history,
        context: {
          workspaceTitle: ws.title,
          domain: ws.domain,
          qualification: ws.qualification,
          candidateName: ws.candidateName,
          studyType: ws.studyType,
          hasSynopsis: Boolean(ws.synopsisText?.trim()),
          checklist: (ws.preThesisChecklist as Record<string, boolean>) ?? {},
          unresolvedConflicts: conflicts.map((c) => ({
            fieldKey: c.fieldKey,
            templateValue: c.templateValue,
            liveValue: c.liveValue,
          })),
          document,
          researchNotes: ws.researchNotes,
        },
        onEvent: (ev) => {
          if (ev.type === "document_updated") {
            document = ev.document;
          }
          send(ev as unknown as Record<string, unknown>);
        },
      });

      await db.insert(preThesisChatMessagesTable).values({
        workspaceId,
        userId: dbUser.id,
        role: "assistant",
        content: assistantContent || "Done.",
        tokensUsed: totalTokens,
      });
    } catch (err) {
      logger.error({ err, workspaceId }, "pre-thesis chat stream failed");
      send({
        type: "error",
        message: err instanceof Error ? err.message : "Assistant failed",
      });
    }

    res.end();
  },
);

router.post("/workspaces/:id/pre-thesis/revisions/undo", requireAuth, async (req, res): Promise<void> => {
  const dbUser = await requireDbUser(req, res);
  if (!dbUser) return;

  const workspaceId = parseInt(String(req.params.id), 10);
  const access = await verifyPreThesisChatAccess(workspaceId, dbUser.id);
  if (access.error || !access.ws) {
    res.status(400).json({ error: "Cannot undo in current state" });
    return;
  }

  try {
    const result = await undoLastAiRevision(workspaceId, dbUser.id);
    if (!result) {
      res.status(400).json({ error: "No previous revision to restore" });
      return;
    }
    res.json({
      ok: true,
      resultJson: result.document,
      preThesisDraftMd: result.draftMd,
      completenessScore: result.completenessScore,
      summary: result.summary,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Undo failed" });
  }
});

export default router;
