/**
 * Assembles full AI context for master chart / dataset generation:
 * user prompt, locked pre-thesis, research vault (DB + storage extracts), chart uploads.
 */
import { db } from "@workspace/db";
import { workspacesTable, sectionsTable, vaultResourcesTable, eq, and, ne } from "@workspace/db";
import { buildAiContextBlock } from "./buildAiContextBlock";
import { loadVaultAiContext } from "./loadVaultForAi";
import { extractDatasetContextText } from "./contextExtract";
import { downloadBuffer } from "./supabaseStorage";
import { logger } from "./logger";

const MAX_VAULT_STORAGE_FILES = 12;
const MAX_VAULT_EXTRACT_PER_FILE = 40_000;
const MAX_TOTAL_CONTEXT = 150_000;

export type DatasetContextBundle = {
  prompt: string;
  fullContext: string;
  hasVault: boolean;
  hasUploads: boolean;
  hasPreThesis: boolean;
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
