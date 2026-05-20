import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sectionsTable, workspacesTable, usersTable } from "@workspace/db";
import { eq, asc } from "@workspace/db";
import { requireAuth, requireDbUser } from "../lib/auth";
import {
  isStorageConfigured,
  uploadThesisExport,
  createSignedDownloadUrl,
} from "../lib/supabaseStorage";
import { randomUUID } from "node:crypto";
import { exportPremiumThesisDocx } from "../services/thesisDocxExport";
import { loadVaultAiContext } from "../lib/loadVaultForAi";
import {
  compileThesisExportText,
  generateDocumentViaCodeRunner,
  type ExportFormat,
} from "../lib/kimiCodeRunner";
import { hasKimiKey } from "../lib/kimiTools";

const router: IRouter = Router();

const CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

async function loadWorkspaceExportContext(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  workspaceId: number,
) {
  const dbUser = await requireDbUser(req, res);
  if (!dbUser) return null;

  const [workspace] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);

  if (!workspace || workspace.userId !== dbUser.id) {
    res.status(404).json({ error: "Workspace not found" });
    return null;
  }

  const [userProfile] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, dbUser.id))
    .limit(1);

  const sections = await db
    .select()
    .from(sectionsTable)
    .where(eq(sectionsTable.workspaceId, workspaceId))
    .orderBy(asc(sectionsTable.order));

  return { dbUser, workspace, userProfile, sections };
}

async function handleKimiExport(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  format: ExportFormat,
): Promise<void> {
  const workspaceId = parseInt(String(req.params.workspaceId), 10);
  if (isNaN(workspaceId)) {
    res.status(400).json({ error: "Invalid workspace ID" });
    return;
  }

  if (!hasKimiKey()) {
    res.status(503).json({ error: "Kimi export engine is not configured. Set KIMI_API_KEY." });
    return;
  }

  const ctx = await loadWorkspaceExportContext(req, res, workspaceId);
  if (!ctx) return;

  const exportText = compileThesisExportText({
    workspace: ctx.workspace,
    userProfile: ctx.userProfile,
    sections: ctx.sections,
  });

  const generated = await generateDocumentViaCodeRunner({
    format,
    thesisTitle: ctx.workspace.title,
    exportText,
    extraInstructions:
      format === "pdf"
        ? "Use reportlab canvas for absolute positioning. Include title page, table of contents, and section headings."
        : format === "docx"
          ? "Use python-docx with BrandHeading style (Arial 16pt, RGB 220,53,69) and justified body paragraphs."
          : "Use openpyxl to create a structured summary sheet with section word counts and completion status.",
  });

  const filename =
    generated.filename ||
    `${ctx.workspace.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_thesis.${format}`;

  if (req.query.archive === "true" && isStorageConfigured()) {
    const exportId = randomUUID();
    const storagePath = await uploadThesisExport(workspaceId, exportId, generated.buffer);
    const signedUrl = await createSignedDownloadUrl(storagePath, 3600, "exports");
    res.json({
      filename,
      storagePath,
      downloadUrl: signedUrl,
      engine: "kimi-k2.6-code_runner",
      modelUsed: generated.modelUsed,
    });
    return;
  }

  res.setHeader("Content-Type", CONTENT_TYPES[format]);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", generated.buffer.length);
  res.send(generated.buffer);
}

router.post(
  "/workspaces/:workspaceId/export/docx",
  requireAuth,
  async (req, res): Promise<void> => {
    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    if (isNaN(workspaceId)) { res.status(400).json({ error: "Invalid workspace ID" }); return; }

    const ctx = await loadWorkspaceExportContext(req, res, workspaceId);
    if (!ctx) return;

    const { workspace, userProfile, sections } = ctx;
    const vaultCtx = await loadVaultAiContext(workspaceId);

    const buffer = await exportPremiumThesisDocx({
      workspace,
      userProfile,
      sections,
      vaultCatalog: vaultCtx.catalog,
    });

    const filename = `${workspace.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_thesis.docx`;

    if (req.query.archive === "true" && isStorageConfigured()) {
      const exportId = randomUUID();
      const storagePath = await uploadThesisExport(workspaceId, exportId, buffer);
      const signedUrl = await createSignedDownloadUrl(storagePath, 3600, "exports");
      res.json({
        filename,
        storagePath,
        downloadUrl: signedUrl,
      });
      return;
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  },
);

router.post(
  "/workspaces/:workspaceId/export/kimi/:format",
  requireAuth,
  async (req, res): Promise<void> => {
    const format = String(req.params.format).toLowerCase() as ExportFormat;
    if (!["pdf", "docx", "xlsx"].includes(format)) {
      res.status(400).json({ error: "Invalid format. Use pdf, docx, or xlsx." });
      return;
    }
    await handleKimiExport(req, res, format);
  },
);

router.post(
  "/workspaces/:workspaceId/export/pdf",
  requireAuth,
  async (req, res): Promise<void> => {
    await handleKimiExport(req, res, "pdf");
  },
);

export default router;
