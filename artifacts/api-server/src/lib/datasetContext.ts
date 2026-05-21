/**
 * Context assembly for the Dataset AI Agent and master chart generation.
 * Provides full parallel context loading for vault, pre-thesis, synopsis,
 * methodology, and chart-specific uploads.
 */
import { db } from "@workspace/db";
import {
  workspacesTable,
  sectionsTable,
  vaultResourcesTable,
  masterChartContextFilesTable,
  eq,
  and,
  ne,
} from "@workspace/db";
import { buildAiContextBlock } from "./buildAiContextBlock";
import { loadVaultAiContext } from "./loadVaultForAi";
import { extractDatasetContextText } from "./contextExtract";
import { downloadBuffer } from "./supabaseStorage";
import { logger } from "./logger";

const MAX_VAULT_STORAGE_FILES = 12;
const MAX_VAULT_EXTRACT_PER_FILE = 40_000;
const MAX_TOTAL_CONTEXT = 150_000;
const MAX_CHART_CONTEXT = 120_000;

export type DatasetContextBundle = {
  prompt: string;
  fullContext: string;
  hasVault: boolean;
  hasUploads: boolean;
  hasPreThesis: boolean;
};

/** Full context object returned by the premium agent loader. */
export type DatasetAgentContextBundle = {
  /** Workspace title and domain */
  workspaceTitle: string;
  domain: string;
  /** Pre-thesis locked markdown block (up to 24k), or synopsis fallback — ready to embed in system prompt */
  preThesisBlock: string;
  /** Vault metadata block — titles, authors, year (small, always embed) */
  vaultMetaBlock: string;
  /** Number of vault resources */
  vaultCount: number;
  /** Full combined context: pre-thesis + vault metadata + vault file text + chart uploads + methodology */
  fullContext: string;
  /** Chart-specific uploaded files text only */
  chartUploads: string;
  /** Flags */
  hasPreThesis: boolean;
  hasVault: boolean;
  hasUploads: boolean;
  hasMethodology: boolean;
};

async function loadVaultStorageExtracts(workspaceId: number): Promise<string> {
  const rows = await db
    .select({
      id: vaultResourcesTable.id,
      title: vaultResourcesTable.title,
      storagePath: vaultResourcesTable.storagePath,
      mimeType: vaultResourcesTable.mimeType,
      content: vaultResourcesTable.content,
    })
    .from(vaultResourcesTable)
    .where(
      and(
        eq(vaultResourcesTable.workspaceId, workspaceId),
        ne(vaultResourcesTable.processingStatus, "failed"),
      ),
    )
    .limit(MAX_VAULT_STORAGE_FILES + 10);

  const parts: string[] = [];
  for (const row of rows) {
    if (!row.storagePath?.trim()) continue;
    if (parts.length >= MAX_VAULT_STORAGE_FILES) break;
    if (row.content?.trim() && row.content.length > 200) {
      parts.push(`--- Research Vault file: ${row.title} ---\n${row.content.slice(0, MAX_VAULT_EXTRACT_PER_FILE)}`);
      continue;
    }
    try {
      const buffer = await downloadBuffer(row.storagePath, "vault");
      if (!buffer?.length) continue;
      const mime = row.mimeType ?? "application/octet-stream";
      const filename = row.title || `vault-${row.id}`;
      const text = await extractDatasetContextText(buffer, mime, filename);
      if (text.trim() && !text.includes("extraction failed") && !text.includes("set KIMI_API_KEY")) {
        parts.push(`--- Research Vault file: ${filename} ---\n${text.slice(0, MAX_VAULT_EXTRACT_PER_FILE)}`);
      }
    } catch (err) {
      logger.warn({ err, vaultId: row.id, title: row.title }, "Vault storage extract skipped");
    }
  }
  return parts.join("\n\n");
}

/**
 * Load chart-specific context files uploaded in the Dataset tab.
 * Exported so the agent can call it independently.
 */
export async function loadChartContextFilesText(chartId: number): Promise<string> {
  const files = await db
    .select()
    .from(masterChartContextFilesTable)
    .where(eq(masterChartContextFilesTable.chartId, chartId))
    .orderBy(masterChartContextFilesTable.createdAt)
    .limit(20);

  if (files.length === 0) return "";

  // Vision files are injected directly as images by the agent — exclude their markers here
  return files
    .filter((f) => !f.extractedText?.startsWith("[VISION_FILE:"))
    .map((f) => `--- ${f.filename} ---\n${f.extractedText ?? ""}`)
    .join("\n\n")
    .slice(0, MAX_CHART_CONTEXT);
}

/** Load context files that should be handled vision-first (images / scanned PDFs). */
export async function loadChartVisionFiles(chartId: number): Promise<
  Array<{ id: number; filename: string; mimeType: string | null; storagePath: string }>
> {
  const files = await db
    .select({
      id: masterChartContextFilesTable.id,
      filename: masterChartContextFilesTable.filename,
      mimeType: masterChartContextFilesTable.mimeType,
      storagePath: masterChartContextFilesTable.storagePath,
      extractedText: masterChartContextFilesTable.extractedText,
    })
    .from(masterChartContextFilesTable)
    .where(eq(masterChartContextFilesTable.chartId, chartId))
    .orderBy(masterChartContextFilesTable.createdAt)
    .limit(20);

  return files.filter(
    (f): f is typeof f & { storagePath: string } =>
      Boolean(f.storagePath) && Boolean(f.extractedText?.startsWith("[VISION_FILE:")),
  );
}

/**
 * Original function — kept for the direct Kimi generation path (generateMasterChartVersion).
 * The chat agent should use loadDatasetAgentContext instead.
 */
export async function buildDatasetGenerationContext(
  workspaceId: number,
  chartContextText: string,
  userPrompt: string | undefined,
  methodsText: string,
  defaultPrompt: string,
): Promise<DatasetContextBundle> {
  const [ws] = await db
    .select({
      preThesisLockedMd: workspacesTable.preThesisLockedMd,
      preThesisDraftMd: workspacesTable.preThesisDraftMd,
      researchNotes: workspacesTable.researchNotes,
      synopsisText: workspacesTable.synopsisText,
    })
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);

  const vaultCtx = await loadVaultAiContext(workspaceId);
  const vaultStorageText = await loadVaultStorageExtracts(workspaceId);

  const preThesisMd = (ws?.preThesisLockedMd ?? ws?.preThesisDraftMd ?? "").trim();
  const preThesisBlock = preThesisMd
    ? buildAiContextBlock(preThesisMd, ws?.researchNotes)
    : ws?.synopsisText?.trim()
      ? `SYNOPSIS / STUDY DESIGN:\n${ws.synopsisText.trim().slice(0, 12_000)}`
      : "";

  const prompt = (userPrompt ?? "").trim() || defaultPrompt;

  const sections = [
    "=== USER CHAT REQUEST (follow this first) ===",
    prompt,
    preThesisBlock ? `\n=== LOCKED PRE-THESIS / STUDY SETUP ===\n${preThesisBlock}` : "",
    vaultCtx.vaultBlock ? `\n=== RESEARCH VAULT (saved sources) ===\n${vaultCtx.vaultBlock}` : "",
    vaultStorageText ? `\n=== RESEARCH VAULT UPLOADED FILES (full text) ===\n${vaultStorageText}` : "",
    methodsText.trim() ? `\n=== METHODOLOGY SECTION ===\n${methodsText.trim()}` : "",
    chartContextText.trim()
      ? `\n=== DATASET CONTEXT UPLOADS (user attached for this chart) ===\n${chartContextText.trim()}`
      : "",
  ].filter(Boolean);

  let fullContext = sections.join("\n").slice(0, MAX_TOTAL_CONTEXT);
  if (fullContext.length < 80) {
    fullContext += `\n\n[Build a complete clinical/research master chart from the user request above. Use standard columns: PatientID, Age, Sex, Group, primary outcomes, and any fields implied by the prompt.]`;
  }

  return {
    prompt,
    fullContext,
    hasVault: vaultCtx.resourceCount > 0 || vaultStorageText.length > 0,
    hasUploads: chartContextText.trim().length > 0,
    hasPreThesis: Boolean(preThesisBlock),
  };
}

export async function loadMethodsExcerpt(workspaceId: number): Promise<string> {
  const methods = await db
    .select({ content: sectionsTable.content })
    .from(sectionsTable)
    .where(and(eq(sectionsTable.workspaceId, workspaceId), eq(sectionsTable.type, "methodology")))
    .limit(1);
  return methods[0]?.content?.replace(/<[^>]+>/g, " ").slice(0, 4000) ?? "";
}

/**
 * Premium agent context loader — used exclusively by the Dataset AI Agent chat path.
 *
 * Loads ALL available context in parallel:
 *   - Workspace pre-thesis locked/draft markdown and synopsis
 *   - Research vault metadata (titles, authors, years) — always embedded in system prompt
 *   - Research vault uploaded files (full text, up to 12 files x 40k chars)
 *   - Chart-specific context uploads
 *   - Methodology section from the sections table
 *
 * Returns structured blocks so the system prompt gets lightweight metadata
 * and the read_full_context tool delivers the heavy text on demand.
 */
export async function loadDatasetAgentContext(
  workspaceId: number,
  chartId: number,
): Promise<DatasetAgentContextBundle> {
  // Load everything in parallel for speed
  const [wsRows, chartUploads, methodsText, vaultCtx, vaultStorageText] = await Promise.all([
    db
      .select({
        title: workspacesTable.title,
        domain: workspacesTable.domain,
        preThesisLockedMd: workspacesTable.preThesisLockedMd,
        preThesisDraftMd: workspacesTable.preThesisDraftMd,
        researchNotes: workspacesTable.researchNotes,
        synopsisText: workspacesTable.synopsisText,
      })
      .from(workspacesTable)
      .where(eq(workspacesTable.id, workspaceId))
      .limit(1),
    loadChartContextFilesText(chartId),
    loadMethodsExcerpt(workspaceId),
    loadVaultAiContext(workspaceId),
    loadVaultStorageExtracts(workspaceId),
  ]);

  const ws = wsRows[0];

  const preThesisMd = (ws?.preThesisLockedMd ?? ws?.preThesisDraftMd ?? "").trim();
  const preThesisBlock = preThesisMd
    ? buildAiContextBlock(preThesisMd, ws?.researchNotes)
    : ws?.synopsisText?.trim()
      ? `SYNOPSIS / STUDY DESIGN:\n${ws.synopsisText.trim().slice(0, 12_000)}`
      : "";

  const hasPreThesis = Boolean(preThesisBlock);
  const hasVault = vaultCtx.resourceCount > 0 || vaultStorageText.length > 0;
  const hasUploads = chartUploads.trim().length > 0;
  const hasMethodology = methodsText.trim().length > 0;

  // Full context: everything combined, capped at 150k
  const fullContextParts = [
    preThesisBlock ? `=== LOCKED PRE-THESIS / STUDY SETUP ===\n${preThesisBlock}` : "",
    vaultCtx.vaultBlock ? `=== RESEARCH VAULT SOURCES (metadata) ===\n${vaultCtx.vaultBlock}` : "",
    vaultStorageText ? `=== RESEARCH VAULT UPLOADED FILES (full text) ===\n${vaultStorageText}` : "",
    methodsText.trim() ? `=== METHODOLOGY SECTION ===\n${methodsText.trim()}` : "",
    chartUploads.trim() ? `=== DATASET CONTEXT UPLOADS (chart-specific files) ===\n${chartUploads.trim()}` : "",
  ].filter(Boolean);

  const fullContext = fullContextParts.join("\n\n").slice(0, MAX_TOTAL_CONTEXT);

  return {
    workspaceTitle: ws?.title ?? "Workspace",
    domain: ws?.domain ?? "Clinical Research",
    preThesisBlock,
    vaultMetaBlock: vaultCtx.vaultBlock,
    vaultCount: vaultCtx.resourceCount,
    fullContext,
    chartUploads,
    hasPreThesis,
    hasVault,
    hasUploads,
    hasMethodology,
  };
}
