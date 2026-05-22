/**
 * POST /api/workspaces/dataset-mastercharts/analyze
 *
 * Stateless pre-create endpoint — no workspaceId required.
 * Accepts multipart form data (synopsis + resource files + text context)
 * and returns categorised master-chart recommendations from Kimi.
 */
import { Router, type IRouter } from "express";
import multer from "multer";
import { requireAuth } from "../lib/auth";
import { extractDatasetContextText } from "../lib/contextExtract";
import { analyseDatasetMasterCharts } from "../lib/datasetMasterChartPreview";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 6 },
});

router.post(
  "/workspaces/dataset-mastercharts/analyze",
  requireAuth,
  upload.fields([
    { name: "synopsis", maxCount: 1 },
    { name: "resources", maxCount: 5 },
  ]),
  async (req, res): Promise<void> => {
    try {
      const body = req.body as Record<string, string>;
      const title = (body.title ?? "").trim();
      const domain = (body.domain ?? "").trim();
      const qualification = (body.qualification ?? "").trim();
      const researchNotes = (body.researchNotes ?? "").trim();

      const fields = req.files as
        | { synopsis?: Express.Multer.File[]; resources?: Express.Multer.File[] }
        | undefined;

      const synopsisFile = fields?.synopsis?.[0] ?? null;
      const resourceFiles = fields?.resources ?? [];

      // Parallel text extraction from uploaded files
      const [synopsisText, ...resourceTexts] = await Promise.all([
        synopsisFile
          ? extractDatasetContextText(
              synopsisFile.buffer,
              synopsisFile.mimetype,
              synopsisFile.originalname,
            )
          : Promise.resolve(""),
        ...resourceFiles.map((f) =>
          extractDatasetContextText(f.buffer, f.mimetype, f.originalname),
        ),
      ]);

      logger.info(
        {
          title,
          domain,
          synopsisLen: synopsisText.length,
          resourceCount: resourceFiles.length,
          notesLen: researchNotes.length,
        },
        "Dataset master-chart preview analysis requested",
      );

      const analysis = await analyseDatasetMasterCharts({
        title,
        domain,
        qualification,
        synopsisText,
        resourceTexts,
        researchNotes,
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

export default router;
