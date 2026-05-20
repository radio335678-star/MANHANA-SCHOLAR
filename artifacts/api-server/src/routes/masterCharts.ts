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
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const router: IRouter = Router();

const CreateChartBody = z.object({
  name: z.string().min(1),
  mode: z.enum(["chat_to_excel", "upload_modify", "auto_from_methods"]),
  linkedSectionId: z.number().optional(),
});

const GenerateBody = z.object({
  prompt: z.string().optional(),
  mode: z.enum(["chat_to_excel", "auto_from_methods"]).optional(),
});

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
    const parsed = GenerateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    try {
      const result = await generateMasterChartVersion(workspaceId, chartId, dbUser.id, parsed.data);
      res.json({
        version: result.version.version,
        stats: result.stats,
        schema: result.spec,
        vaultResourceId: result.vaultResourceId,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Generate failed" });
    }
  },
);

router.post(
  "/workspaces/:workspaceId/master-charts/:chartId/context",
  requireAuth,
  upload.fields([{ name: "files", maxCount: 20 }, { name: "file", maxCount: 1 }]),
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
      res.status(400).json({ error: err instanceof Error ? err.message : "Context upload failed" });
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

export default router;
