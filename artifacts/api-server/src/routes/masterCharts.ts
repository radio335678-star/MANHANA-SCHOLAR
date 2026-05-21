import { Router, type IRouter } from "express";
import multer from "multer";
import { requireAuth, requireDbUser } from "../lib/auth";
import {
  listCharts,
  createMasterChart,
  getChartWithLatestVersion,
  getChartVersion,
  generateMasterChartVersion,
  uploadMasterChartFile,
  getChartDownloadUrl,
  uploadChartContextFile,
  uploadChartContextFiles,
  deleteMasterChartVersion,
  deleteChartContextFile,
} from "../services/masterChart";
import { runDatasetAgentChat } from "../lib/datasetAgent";
import { db } from "@workspace/db";
import {
  datasetChatMessagesTable,
  masterChartsTable,
  workspacesTable,
  eq,
  and,
  desc,
} from "@workspace/db";
import { z } from "zod";
import { logger } from "../lib/logger";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const router: IRouter = Router();

const CreateChartBody = z.object({
  name: z.string().min(1),
  mode: z.enum(["chat_to_excel", "upload_modify", "auto_from_methods"]),
  linkedSectionId: z.number().optional(),
});

const GenerateBody = z
  .object({
    prompt: z.string().optional(),
    content: z.string().optional(),
    message: z.string().optional(),
    text: z.string().optional(),
    mode: z.enum(["chat_to_excel", "auto_from_methods"]).optional(),
  })
  .transform((b) => ({
    prompt: (b.prompt ?? b.content ?? b.message ?? b.text)?.trim() || undefined,
    mode: b.mode,
  }));

function formatZodError(err: z.ZodError): string {
  const first = err.issues[0];
  if (!first) return "Invalid request";
  return first.message.includes("Required") || first.message.includes("expected")
    ? "Invalid request body. Send JSON with a prompt field."
    : first.message;
}

function isAllowedContextFile(mimetype: string, originalname: string): boolean {
  return (
    mimetype.startsWith("image/") ||
    mimetype.includes("pdf") ||
    mimetype.includes("word") ||
    mimetype.includes("spreadsheet") ||
    mimetype.includes("excel") ||
    mimetype.includes("text") ||
    mimetype.includes("csv") ||
    /\.(pdf|docx?|xlsx|xls|csv|txt|png|jpe?g|webp|gif|bmp|tiff?)$/i.test(originalname)
  );
}

router.get("/workspaces/:workspaceId/master-charts", requireAuth, async (req, res): Promise<void> => {
  const dbUser = await requireDbUser(req, res);
  if (!dbUser) return;

  const workspaceId = parseInt(String(req.params.workspaceId), 10);
  const charts = await listCharts(workspaceId);

  res.json(
    charts.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  );
});

router.post("/workspaces/:workspaceId/master-charts", requireAuth, async (req, res): Promise<void> => {
  const dbUser = await requireDbUser(req, res);
  if (!dbUser) return;

  const workspaceId = parseInt(String(req.params.workspaceId), 10);
  const parsed = CreateChartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const chart = await createMasterChart(workspaceId, dbUser.id, parsed.data);
    res.status(201).json({
      ...chart,
      createdAt: chart.createdAt.toISOString(),
      updatedAt: chart.updatedAt.toISOString(),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

router.get(
  "/workspaces/:workspaceId/master-charts/:chartId",
  requireAuth,
  async (req, res): Promise<void> => {
    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const chartId = parseInt(String(req.params.chartId), 10);
    const data = await getChartWithLatestVersion(workspaceId, chartId);
    if (!data) {
      res.status(404).json({ error: "Chart not found" });
      return;
    }
    res.json({
      chart: {
        ...data.chart,
        createdAt: data.chart.createdAt.toISOString(),
        updatedAt: data.chart.updatedAt.toISOString(),
      },
      version: data.version
        ? {
            ...data.version,
            createdAt: data.version.createdAt.toISOString(),
          }
        : null,
      versions: data.versions.map((v) => ({
        ...v,
        createdAt: v.createdAt.toISOString(),
      })),
      contextFiles: data.contextFiles.map((f) => ({
        ...f,
        createdAt: f.createdAt.toISOString(),
      })),
    });
  },
);

router.get(
  "/workspaces/:workspaceId/master-charts/:chartId/versions/:version",
  requireAuth,
  async (req, res): Promise<void> => {
    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const chartId = parseInt(String(req.params.chartId), 10);
    const version = parseInt(String(req.params.version), 10);
    const ver = await getChartVersion(workspaceId, chartId, version);
    if (!ver) {
      res.status(404).json({ error: "Version not found" });
      return;
    }
    res.json({
      version: ver.version,
      schemaJson: ver.schemaJson,
      statsSummary: ver.statsSummary,
      vaultResourceId: ver.vaultResourceId,
      createdAt: ver.createdAt.toISOString(),
    });
  },
);

router.delete(
  "/workspaces/:workspaceId/master-charts/:chartId/versions/:version",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const chartId = parseInt(String(req.params.chartId), 10);
    const version = parseInt(String(req.params.version), 10);

    try {
      const result = await deleteMasterChartVersion(workspaceId, chartId, version, dbUser.id);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Delete failed" });
    }
  },
);

router.post(
  "/workspaces/:workspaceId/master-charts/:chartId/generate",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const chartId = parseInt(String(req.params.chartId), 10);
    const bodyRaw = req.body;
    if (bodyRaw == null || (typeof bodyRaw === "object" && Object.keys(bodyRaw).length === 0)) {
      // Empty body is OK — server uses default prompt + vault/uploads context
    }
    const parsed = GenerateBody.safeParse(bodyRaw ?? {});
    if (!parsed.success) {
      res.status(422).json({ error: formatZodError(parsed.error) });
      return;
    }

    if (isNaN(workspaceId) || isNaN(chartId)) {
      res.status(422).json({ error: "Invalid workspace or chart id" });
      return;
    }

    try {
      const result = await generateMasterChartVersion(workspaceId, chartId, dbUser.id, parsed.data);
      res.json({
        version: result.version.version,
        stats: result.stats,
        schema: result.spec,
        vaultResourceId: result.vaultResourceId,
        usedFallback: result.usedFallback ?? false,
        warning: result.usedFallback
          ? "AI used a starter template. Upload context files or refine your prompt and try again."
          : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generate failed";
      const isTimeout = msg.toLowerCase().includes("timed out");
      const isGate =
        msg.includes("locked pre-thesis") || msg.includes("Chart not found");
      if (isGate) {
        res.status(msg.includes("not found") ? 404 : 403).json({ error: msg });
        return;
      }
      if (isTimeout) {
        res.status(408).json({ error: msg });
        return;
      }
      logger.error({ err, workspaceId, chartId }, "Dataset generate unexpected error");
      res.status(500).json({
        error: "Dataset generation failed unexpectedly. Please try again in a moment.",
      });
    }
  },
);

router.post(
  "/workspaces/:workspaceId/master-charts/:chartId/context",
  requireAuth,
  upload.fields([{ name: "files", maxCount: 3 }, { name: "file", maxCount: 1 }]),
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const chartId = parseInt(String(req.params.chartId), 10);
    const fields = req.files as { files?: Express.Multer.File[]; file?: Express.Multer.File[] } | undefined;
    const incoming = [...(fields?.files ?? []), ...(fields?.file ?? [])];
    if (incoming.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    const valid = incoming.filter((f) => isAllowedContextFile(f.mimetype, f.originalname));
    if (valid.length === 0) {
      res.status(400).json({ error: "Unsupported file type for dataset context" });
      return;
    }

    try {
      const rows = await uploadChartContextFiles(
        workspaceId,
        chartId,
        dbUser.id,
        valid.map((f) => ({
          buffer: f.buffer,
          originalname: f.originalname,
          mimetype: f.mimetype,
        })),
      );
      res.status(201).json({
        files: rows.map((row) => ({
          id: row.id,
          filename: row.filename,
          extractedPreview: row.extractedText?.slice(0, 300) ?? "",
          vaultResourceId: row.vaultResourceId,
        })),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Context upload failed";
      const status = msg.includes("Maximum 3") || msg.includes("Maximum 20") ? 409 : msg.includes("not found") ? 404 : 500;
      res.status(status).json({ error: msg });
    }
  },
);

router.delete(
  "/workspaces/:workspaceId/master-charts/:chartId/context/:fileId",
  requireAuth,
  async (req, res): Promise<void> => {
    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const chartId = parseInt(String(req.params.chartId), 10);
    const fileId = parseInt(String(req.params.fileId), 10);

    try {
      await deleteChartContextFile(workspaceId, chartId, fileId);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Delete failed" });
    }
  },
);

router.post(
  "/workspaces/:workspaceId/master-charts/:chartId/upload",
  requireAuth,
  upload.single("file"),
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const chartId = parseInt(String(req.params.chartId), 10);
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    try {
      const result = await uploadMasterChartFile(workspaceId, chartId, dbUser.id, file.buffer);
      res.json({
        version: result.version.version,
        stats: result.stats,
        schema: result.spec,
        vaultResourceId: result.vaultResourceId,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed" });
    }
  },
);

router.get(
  "/workspaces/:workspaceId/master-charts/:chartId/download",
  requireAuth,
  async (req, res): Promise<void> => {
    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const chartId = parseInt(String(req.params.chartId), 10);
    const format = req.query.format === "csv" ? "csv" : "xlsx";

    try {
      const { url, version } = await getChartDownloadUrl(workspaceId, chartId, format);
      if (!url) {
        res.status(503).json({ error: "Storage not configured or file unavailable" });
        return;
      }
      res.json({ url, version, format });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : "Not found" });
    }
  },
);

router.post(
  "/workspaces/:workspaceId/master-charts/:chartId/analyze",
  requireAuth,
  async (req, res): Promise<void> => {
    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const chartId = parseInt(String(req.params.chartId), 10);
    const data = await getChartWithLatestVersion(workspaceId, chartId);
    if (!data?.version?.statsSummary) {
      res.status(404).json({ error: "No analyzed version" });
      return;
    }
    res.json({ stats: data.version.statsSummary });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Dataset Agent Chat routes
// ─────────────────────────────────────────────────────────────────────────────

const ChatSendBody = z.object({
  content: z.string().min(1).max(12000),
});

async function verifyChartOwnership(
  workspaceId: number,
  chartId: number,
  userId: number,
): Promise<boolean> {
  const [chart] = await db
    .select({ id: masterChartsTable.id })
    .from(masterChartsTable)
    .where(and(eq(masterChartsTable.id, chartId), eq(masterChartsTable.workspaceId, workspaceId)))
    .limit(1);
  if (!chart) return false;

  const [ws] = await db
    .select({ userId: workspacesTable.userId })
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);
  return ws?.userId === userId;
}

// GET  .../master-charts/:chartId/chat  — last 50 messages
router.get(
  "/workspaces/:workspaceId/master-charts/:chartId/chat",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const chartId = parseInt(String(req.params.chartId), 10);

    if (!(await verifyChartOwnership(workspaceId, chartId, dbUser.id))) {
      res.status(404).json({ error: "Chart not found" });
      return;
    }

    const messages = await db
      .select()
      .from(datasetChatMessagesTable)
      .where(eq(datasetChatMessagesTable.chartId, chartId))
      .orderBy(datasetChatMessagesTable.createdAt)
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
  },
);

// DELETE .../master-charts/:chartId/chat/clear  — clear history
router.delete(
  "/workspaces/:workspaceId/master-charts/:chartId/chat/clear",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const chartId = parseInt(String(req.params.chartId), 10);

    if (!(await verifyChartOwnership(workspaceId, chartId, dbUser.id))) {
      res.status(404).json({ error: "Chart not found" });
      return;
    }

    await db
      .delete(datasetChatMessagesTable)
      .where(eq(datasetChatMessagesTable.chartId, chartId));

    res.json({ ok: true });
  },
);

// POST .../master-charts/:chartId/chat/stream  — SSE agent run
router.post(
  "/workspaces/:workspaceId/master-charts/:chartId/chat/stream",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const chartId = parseInt(String(req.params.chartId), 10);

    const body = ChatSendBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    if (!(await verifyChartOwnership(workspaceId, chartId, dbUser.id))) {
      res.status(404).json({ error: "Chart not found" });
      return;
    }

    // Persist user message
    await db.insert(datasetChatMessagesTable).values({
      workspaceId,
      chartId,
      userId: dbUser.id,
      role: "user",
      content: body.data.content,
    });

    // Load history (last 10 messages, skip the one we just inserted)
    const historyRows = await db
      .select()
      .from(datasetChatMessagesTable)
      .where(eq(datasetChatMessagesTable.chartId, chartId))
      .orderBy(datasetChatMessagesTable.createdAt)
      .limit(12); // fetch 12, slice off last (the just-inserted user msg), use 10

    const history = historyRows
      .slice(0, -1)
      .slice(-10)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Start SSE stream
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    // Padding helps some proxies flush the SSE stream immediately.
    res.write(`: ${" ".repeat(2048)}\n\n`);

    type FlushableResponse = Response & { flush?: () => void };
    const send = (event: Record<string, unknown>) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        (res as FlushableResponse).flush?.();
      } catch {
        // client disconnected — ignore
      }
    };

    send({ type: "ping" });

    // Heartbeat every 8s to keep proxy/browser alive during long Kimi calls
    const heartbeat = setInterval(() => {
      send({ type: "ping" });
    }, 8_000);

    let assistantContent = "";
    let totalTokens = 0;
    let agentError: string | undefined;

    try {
      const result = await runDatasetAgentChat({
        workspaceId,
        chartId,
        userId: dbUser.id,
        userMessage: body.data.content,
        history,
        onEvent: (ev) => {
          if (ev.type === "token") assistantContent += ev.content;
          send(ev as unknown as Record<string, unknown>);
        },
      });
      assistantContent = result.assistantContent || assistantContent;
      totalTokens = result.totalTokens;
    } catch (err) {
      agentError = err instanceof Error ? err.message : "Agent failed";
      logger.error({ err, workspaceId, chartId }, "Dataset agent stream failed");
      send({ type: "error", message: agentError });
    } finally {
      clearInterval(heartbeat);

      // Always persist an assistant row so chat history is never silent after failure
      const persistContent = assistantContent.trim()
        ? assistantContent
        : agentError
          ? `__error__${agentError}`
          : "Agent completed tool actions — check the spreadsheet for updates.";

      await db.insert(datasetChatMessagesTable).values({
        workspaceId,
        chartId,
        userId: dbUser.id,
        role: "assistant",
        content: persistContent,
        tokensUsed: totalTokens,
      }).catch((dbErr) => {
        logger.error({ dbErr, chartId }, "Failed to persist assistant reply");
      });

      send({ type: "done", totalTokens, content: assistantContent });
      res.end();
    }
  },
);

export default router;
