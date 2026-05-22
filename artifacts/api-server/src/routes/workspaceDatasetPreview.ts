/**
 * POST /api/workspaces/dataset-mastercharts/analyze
 * POST /api/workspaces/dataset-mastercharts/analyze/stream
 *
 * Stateless pre-create endpoint — no workspaceId required.
 * Accepts multipart form data (synopsis + resource files + text context)
 * and returns categorised master-chart recommendations from Kimi.
 */
import { Router, type IRouter, type Request } from "express";
import multer from "multer";
import { requireAuth } from "../lib/auth";
import { extractDatasetContextText } from "../lib/contextExtract";
import { analyseDatasetMasterCharts, type DatasetPreviewStreamEvent } from "../lib/datasetMasterChartPreview";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 6 },
});

function parseAnalyzeRequest(req: Request) {
  const body = req.body as Record<string, string>;
  const title = (body.title ?? "").trim();
  const domain = (body.domain ?? "").trim();
  const qualification = (body.qualification ?? "").trim();
  const researchNotes = (body.researchNotes ?? "").trim();

  const fields = req.files as
    | { synopsis?: Express.Multer.File[]; resources?: Express.Multer.File[] }
    | undefined;

  return {
    title,
    domain,
    qualification,
    researchNotes,
    synopsisFile: fields?.synopsis?.[0] ?? null,
    resourceFiles: fields?.resources ?? [],
  };
}

async function extractAnalyzeTexts(input: ReturnType<typeof parseAnalyzeRequest>) {
  const [synopsisText, ...resourceTexts] = await Promise.all([
    input.synopsisFile
      ? extractDatasetContextText(
          input.synopsisFile.buffer,
          input.synopsisFile.mimetype,
          input.synopsisFile.originalname,
        )
      : Promise.resolve(""),
    ...input.resourceFiles.map((f) =>
      extractDatasetContextText(f.buffer, f.mimetype, f.originalname),
    ),
  ]);

  return { synopsisText, resourceTexts };
}

function sendSse(res: { write: (chunk: string) => void }, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

router.post(
  "/workspaces/dataset-mastercharts/analyze",
  requireAuth,
  upload.fields([
    { name: "synopsis", maxCount: 1 },
    { name: "resources", maxCount: 5 },
  ]),
  async (req, res): Promise<void> => {
    try {
      const input = parseAnalyzeRequest(req);
      const { synopsisText, resourceTexts } = await extractAnalyzeTexts(input);

      logger.info(
        {
          title: input.title,
          domain: input.domain,
          synopsisLen: synopsisText.length,
          resourceCount: input.resourceFiles.length,
          notesLen: input.researchNotes.length,
        },
        "Dataset master-chart preview analysis requested",
      );

      const analysis = await analyseDatasetMasterCharts({
        title: input.title,
        domain: input.domain,
        qualification: input.qualification,
        synopsisText,
        resourceTexts,
        researchNotes: input.researchNotes,
      });

      res.json(analysis);
    } catch (err) {
      logger.error({ err }, "Dataset master-chart analyze endpoint error");
      const message =
        err instanceof Error
          ? err.message
          : "Analysis failed. Please try again.";
      res.status(message.includes("not configured") ? 503 : 500).json({
        error: message,
      });
    }
  },
);

router.post(
  "/workspaces/dataset-mastercharts/analyze/stream",
  requireAuth,
  upload.fields([
    { name: "synopsis", maxCount: 1 },
    { name: "resources", maxCount: 5 },
  ]),
  async (req, res): Promise<void> => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const sendProgress = (event: DatasetPreviewStreamEvent) => sendSse(res, event.type, event);

    try {
      const input = parseAnalyzeRequest(req);

      sendProgress({
        type: "status",
        content: "Deep analysis started. This can take 2-4 minutes — please be patient.",
      });
      sendProgress({
        type: "status",
        content: input.synopsisFile
          ? `Reading synopsis file: ${input.synopsisFile.originalname}`
          : "Reading study notes and project context.",
      });
      if (input.resourceFiles.length > 0) {
        sendProgress({
          type: "status",
          content: `Extracting evidence from ${input.resourceFiles.length} reference file(s).`,
        });
      }

      const { synopsisText, resourceTexts } = await extractAnalyzeTexts(input);

      sendProgress({
        type: "status",
        content: "Text extraction complete. Sending study context to Kimi for dataset planning.",
      });

      const analysis = await analyseDatasetMasterCharts(
        {
          title: input.title,
          domain: input.domain,
          qualification: input.qualification,
          synopsisText,
          resourceTexts,
          researchNotes: input.researchNotes,
        },
        sendProgress,
      );

      sendProgress({
        type: "status",
        content: "Recommendations ready. Preparing selectable master-chart sections.",
      });
      sendSse(res, "done", analysis);
      res.end();
    } catch (err) {
      logger.error({ err }, "Dataset master-chart analyze stream endpoint error");
      const message =
        err instanceof Error
          ? err.message
          : "Analysis failed. Please try again.";
      sendSse(res, "error", { error: message });
      res.end();
    }
  },
);

export default router;
