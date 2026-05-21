import { db } from "@workspace/db";
import {
  masterChartsTable,
  masterChartVersionsTable,
  masterChartContextFilesTable,
  workspacesTable,
  activityEventsTable,
} from "@workspace/db";
import { eq, and, desc, count } from "@workspace/db";
import { kimiGenerateSheetSpec } from "../lib/kimiTools";
import { buildXlsxFromSpec, parseXlsx, computeBasicStats } from "../lib/excelBuilder";
import {
  uploadBuffer,
  masterChartPath,
  createSignedDownloadUrl,
  isStorageConfigured,
  bucketFor,
} from "../lib/supabaseStorage";
import { createClient } from "@supabase/supabase-js";
import { isAtLeastLocked, isWorkflowState } from "../types/workflow";
import { saveArtifactToVault } from "../lib/vaultArtifact";
import { extractDatasetContextText } from "../lib/contextExtract";
import { buildDatasetGenerationContext, loadMethodsExcerpt } from "../lib/datasetContext";
import { logger } from "../lib/logger";
import { getKimiApiKey } from "../lib/kimiModels";

const KIMI_GENERATION_TIMEOUT_MS = 110_000; // 110s — beats Render's 120s gateway timeout

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`AI generation timed out after ${ms / 1000}s. Please try again — complex documents may need a simpler prompt or smaller upload.`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export async function assertMasterChartAllowed(workspaceId: number): Promise<void> {
  const [ws] = await db
    .select({ workflowState: workspacesTable.workflowState })
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);
  const state = ws?.workflowState && isWorkflowState(ws.workflowState) ? ws.workflowState : "init";
  if (!isAtLeastLocked(state)) {
    throw new Error("Master Chart requires locked pre-thesis setup (workflow >= locked_in)");
  }
}

async function loadChartContextText(chartId: number): Promise<string> {
  const files = await db
    .select()
    .from(masterChartContextFilesTable)
    .where(eq(masterChartContextFilesTable.chartId, chartId))
    .orderBy(masterChartContextFilesTable.createdAt)
    .limit(20);

  if (files.length === 0) return "";

  return files
    .filter((f) => !f.extractedText?.startsWith("[VISION_FILE:"))
    .map((f) => `--- ${f.filename} ---\n${f.extractedText ?? ""}`)
    .join("\n\n")
    .slice(0, 120_000);
}

async function removeStoragePath(storagePath: string): Promise<void> {
  if (!isStorageConfigured() || !storagePath) return;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const client = createClient(url, key, { auth: { persistSession: false } });
  await client.storage.from(bucketFor("artifacts")).remove([storagePath]);
}

async function mirrorChartToVault(
  workspaceId: number,
  userId: number,
  chartName: string,
  version: number,
  xlsx: Buffer,
): Promise<number | undefined> {
  const title = `Master Chart — ${chartName} — v${version}.xlsx`;
  return saveArtifactToVault({
    workspaceId,
    userId,
    title,
    filename: `master-chart-${version}.xlsx`,
    buffer: xlsx,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    activityDescription: `Master chart saved to Research Vault: "${title}"`,
  });
}

export async function createMasterChart(
  workspaceId: number,
  userId: number,
  data: { name: string; mode: "chat_to_excel" | "upload_modify" | "auto_from_methods"; linkedSectionId?: number },
) {
  await assertMasterChartAllowed(workspaceId);
  const [chart] = await db
    .insert(masterChartsTable)
    .values({
      workspaceId,
      name: data.name,
      mode: data.mode,
      linkedSectionId: data.linkedSectionId ?? null,
    })
    .returning();

  await db.insert(activityEventsTable).values({
    userId,
    workspaceId,
    type: "master_chart_created",
    description: `Created master chart "${data.name}"`,
  });

  return chart!;
}

/**
 * Returns true when a file should be handled with vision-first strategy:
 * - All image files (user attaches a scanned photo, a chart screenshot, etc.)
 * - PDFs that appear scanned (detected after extraction attempt, < 300 chars usable text)
 *
 * Vision files are stored raw in Supabase Storage so the agent can pass them
 * directly as image_url to Kimi — no lossy OCR step in the middle.
 */
function isImageMime(mimeType: string, filename: string): boolean {
  return (
    mimeType.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(filename)
  );
}

function contextFilePath(chartId: number, filename: string): string {
  const ts = Date.now();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return `context/${chartId}/${ts}-${safe}`;
}

/** Upload raw buffer to Supabase Storage and return the storage path, or null. */
async function storeContextFileRaw(
  chartId: number,
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string | null> {
  if (!isStorageConfigured()) return null;
  const path = contextFilePath(chartId, filename);
  await uploadBuffer(path, buffer, mimeType || "application/octet-stream");
  return path;
}

export async function uploadChartContextFile(
  workspaceId: number,
  chartId: number,
  userId: number,
  file: { buffer: Buffer; originalname: string; mimetype: string },
) {
  await assertMasterChartAllowed(workspaceId);

  const [chart] = await db
    .select()
    .from(masterChartsTable)
    .where(and(eq(masterChartsTable.id, chartId), eq(masterChartsTable.workspaceId, workspaceId)))
    .limit(1);
  if (!chart) throw new Error("Chart not found");

  const [{ total: contextCount }] = await db
    .select({ total: count() })
    .from(masterChartContextFilesTable)
    .where(eq(masterChartContextFilesTable.chartId, chartId));
  if (Number(contextCount) >= 20) {
    throw new Error("Maximum 20 context files per dataset. Remove a file before uploading more.");
  }

  let extractedText: string;
  let storagePath: string | null = null;

  if (isImageMime(file.mimetype, file.originalname)) {
    // ── Vision-first: images are passed directly to Kimi at inference time ──
    storagePath = await storeContextFileRaw(chartId, file.buffer, file.originalname, file.mimetype);
    extractedText = `[VISION_FILE: ${file.originalname}]`;
    logger.info({ chartId, filename: file.originalname }, "Context file stored as vision (image)");
  } else {
    // ── Text-first: attempt extraction for PDFs, DOCX, XLSX, etc. ──
    extractedText = await extractDatasetContextText(
      file.buffer,
      file.mimetype,
      file.originalname,
    );

    const usableChars = extractedText
      .replace(/\[.*?\]/g, "")
      .replace(/extraction failed/gi, "")
      .trim().length;

    const isPoorExtraction =
      usableChars < 300 ||
      extractedText.includes("extraction failed") ||
      extractedText.includes("set KIMI_API_KEY");

    if (isPoorExtraction && (file.mimetype.includes("pdf") || /\.pdf$/i.test(file.originalname))) {
      // Scanned PDF — switch to vision path
      storagePath = await storeContextFileRaw(chartId, file.buffer, file.originalname, "application/pdf");
      extractedText = `[VISION_FILE: ${file.originalname}]`;
      logger.info({ chartId, filename: file.originalname, usableChars }, "Context PDF stored as vision (scanned)");
    } else if (!extractedText.trim() || isPoorExtraction) {
      extractedText = `[Uploaded: ${file.originalname} — text could not be extracted; describe this file in chat and regenerate.]`;
    }
  }

  let vaultResourceId: number | undefined;
  if (isStorageConfigured()) {
    vaultResourceId = await saveArtifactToVault({
      workspaceId,
      userId,
      title: `Dataset context — ${file.originalname}`,
      filename: file.originalname,
      buffer: file.buffer,
      mimeType: file.mimetype,
      activityDescription: `Dataset context file uploaded: "${file.originalname}"`,
    });
  }

  const [row] = await db
    .insert(masterChartContextFilesTable)
    .values({
      chartId,
      filename: file.originalname,
      mimeType: file.mimetype,
      extractedText,
      storagePath: storagePath ?? null,
      vaultResourceId: vaultResourceId ?? null,
    })
    .returning();

  return row!;
}

export async function uploadChartContextFiles(
  workspaceId: number,
  chartId: number,
  userId: number,
  files: Array<{ buffer: Buffer; originalname: string; mimetype: string }>,
) {
  const results: Awaited<ReturnType<typeof uploadChartContextFile>>[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      results.push(await uploadChartContextFile(workspaceId, chartId, userId, file));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      errors.push(`${file.originalname}: ${msg}`);
      logger.warn({ err, filename: file.originalname }, "Context file upload partial failure");
    }
  }
  if (results.length === 0 && errors.length > 0) {
    throw new Error(errors.join("; "));
  }
  return results;
}

export async function listChartContextFiles(chartId: number) {
  return db
    .select()
    .from(masterChartContextFilesTable)
    .where(eq(masterChartContextFilesTable.chartId, chartId))
    .orderBy(desc(masterChartContextFilesTable.createdAt));
}

export async function generateMasterChartVersion(
  workspaceId: number,
  chartId: number,
  userId: number,
  opts: { prompt?: string; mode?: "chat_to_excel" | "auto_from_methods" },
) {
  await assertMasterChartAllowed(workspaceId);

  const [chart] = await db
    .select()
    .from(masterChartsTable)
    .where(and(eq(masterChartsTable.id, chartId), eq(masterChartsTable.workspaceId, workspaceId)))
    .limit(1);
  if (!chart) throw new Error("Chart not found");

  const chartContextText = await loadChartContextText(chartId);

  let methodsText = "";
  if (opts.mode === "auto_from_methods" || chart.mode === "auto_from_methods") {
    methodsText = await loadMethodsExcerpt(workspaceId);
  }

  const defaultPrompt =
    chart.mode === "auto_from_methods"
      ? "Generate a patient master chart template matching the study design in Methods."
      : "Generate a clinical study master chart with standard demographic and outcome columns.";

  const { prompt, fullContext } = await buildDatasetGenerationContext(
    workspaceId,
    chartContextText,
    opts.prompt,
    methodsText,
    defaultPrompt,
  );

  logger.info(
    {
      workspaceId,
      chartId,
      promptLen: prompt.length,
      contextLen: fullContext.length,
    },
    "Dataset generation context assembled",
  );

  let currentSheet: Awaited<ReturnType<typeof parseXlsx>> | null = null;
  if (chart.currentVersion > 0) {
    const [currentVer] = await db
      .select()
      .from(masterChartVersionsTable)
      .where(
        and(
          eq(masterChartVersionsTable.chartId, chartId),
          eq(masterChartVersionsTable.version, chart.currentVersion),
        ),
      )
      .limit(1);
    if (currentVer?.schemaJson) {
      currentSheet = currentVer.schemaJson as Awaited<ReturnType<typeof parseXlsx>>;
    }
  }

  logger.info({ workspaceId, chartId }, "Starting Kimi sheet generation");
  let spec: Awaited<ReturnType<typeof kimiGenerateSheetSpec>>["spec"];
  let modelUsed: string;
  let workbook: Awaited<ReturnType<typeof kimiGenerateSheetSpec>>["workbook"];
  let usedFallback = false;

  try {
    const result = await withTimeout(
      kimiGenerateSheetSpec(prompt, fullContext, currentSheet),
      KIMI_GENERATION_TIMEOUT_MS,
      "kimiGenerateSheetSpec",
    );
    spec = result.spec;
    modelUsed = result.modelUsed;
    workbook = result.workbook;
    usedFallback = result.usedFallback;
  } catch (err) {
    const timedOut = err instanceof Error && err.message.toLowerCase().includes("timed out");
    if (!timedOut) throw err;
    logger.warn({ workspaceId, chartId }, "Kimi timed out — using safe fallback workbook");
    const fallback = await kimiGenerateSheetSpec(
      prompt,
      fullContext.slice(0, 50_000),
      currentSheet,
    );
    spec = fallback.spec;
    modelUsed = fallback.modelUsed;
    workbook = fallback.workbook;
    usedFallback = true;
  }

  if (usedFallback) {
    logger.warn({ workspaceId, chartId, modelUsed }, "Dataset generation used template fallback");
  }
  const xlsx = await buildXlsxFromSpec(workbook);
  const stats = computeBasicStats(spec);

  const nextVersion = chart.currentVersion + 1;
  const path = masterChartPath(workspaceId, chartId, nextVersion);

  if (isStorageConfigured()) {
    await uploadBuffer(path, xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  const vaultResourceId = await mirrorChartToVault(workspaceId, userId, chart.name, nextVersion, xlsx);

  const [version] = await db
    .insert(masterChartVersionsTable)
    .values({
      chartId,
      version: nextVersion,
      storagePath: path,
      schemaJson: { ...spec, sheets: workbook.sheets } as unknown as Record<string, unknown>,
      statsSummary: stats,
      vaultResourceId: vaultResourceId ?? null,
      modelUsed,
    })
    .returning();

  await db
    .update(masterChartsTable)
    .set({ currentVersion: nextVersion, updatedAt: new Date() })
    .where(eq(masterChartsTable.id, chartId));

  return { chart, version: version!, spec, stats, modelUsed, vaultResourceId, usedFallback };
}

export async function uploadMasterChartFile(
  workspaceId: number,
  chartId: number,
  userId: number,
  buffer: Buffer,
) {
  await assertMasterChartAllowed(workspaceId);
  const spec = await parseXlsx(buffer);
  const stats = computeBasicStats(spec);

  const [chart] = await db
    .select()
    .from(masterChartsTable)
    .where(and(eq(masterChartsTable.id, chartId), eq(masterChartsTable.workspaceId, workspaceId)))
    .limit(1);
  if (!chart) throw new Error("Chart not found");

  const nextVersion = chart.currentVersion + 1;
  const path = masterChartPath(workspaceId, chartId, nextVersion);
  const xlsx = await buildXlsxFromSpec(spec);

  if (isStorageConfigured()) {
    await uploadBuffer(path, xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  const vaultResourceId = await mirrorChartToVault(workspaceId, userId, chart.name, nextVersion, xlsx);

  const [version] = await db
    .insert(masterChartVersionsTable)
    .values({
      chartId,
      version: nextVersion,
      storagePath: path,
      schemaJson: spec as unknown as Record<string, unknown>,
      statsSummary: stats,
      vaultResourceId: vaultResourceId ?? null,
      modelUsed: "upload",
    })
    .returning();

  await db
    .update(masterChartsTable)
    .set({ currentVersion: nextVersion, updatedAt: new Date() })
    .where(eq(masterChartsTable.id, chartId));

  return { chart, version: version!, spec, stats, vaultResourceId };
}

export async function getChartDownloadUrl(workspaceId: number, chartId: number, format: "xlsx" | "csv") {
  const [chart] = await db
    .select()
    .from(masterChartsTable)
    .where(and(eq(masterChartsTable.id, chartId), eq(masterChartsTable.workspaceId, workspaceId)))
    .limit(1);
  if (!chart || chart.currentVersion === 0) throw new Error("No chart version available");

  const [ver] = await db
    .select()
    .from(masterChartVersionsTable)
    .where(
      and(eq(masterChartVersionsTable.chartId, chartId), eq(masterChartVersionsTable.version, chart.currentVersion)),
    )
    .limit(1);
  if (!ver) throw new Error("Version not found");

  const url = await createSignedDownloadUrl(ver.storagePath);
  return { url, version: ver.version, format, vaultResourceId: ver.vaultResourceId };
}

export async function listChartVersions(chartId: number) {
  return db
    .select({
      version: masterChartVersionsTable.version,
      modelUsed: masterChartVersionsTable.modelUsed,
      vaultResourceId: masterChartVersionsTable.vaultResourceId,
      schemaJson: masterChartVersionsTable.schemaJson,
      statsSummary: masterChartVersionsTable.statsSummary,
      createdAt: masterChartVersionsTable.createdAt,
    })
    .from(masterChartVersionsTable)
    .where(eq(masterChartVersionsTable.chartId, chartId))
    .orderBy(desc(masterChartVersionsTable.version));
}

export async function getChartVersion(workspaceId: number, chartId: number, version: number) {
  const [chart] = await db
    .select()
    .from(masterChartsTable)
    .where(and(eq(masterChartsTable.id, chartId), eq(masterChartsTable.workspaceId, workspaceId)))
    .limit(1);
  if (!chart) return null;

  const [ver] = await db
    .select()
    .from(masterChartVersionsTable)
    .where(and(eq(masterChartVersionsTable.chartId, chartId), eq(masterChartVersionsTable.version, version)))
    .limit(1);
  return ver ?? null;
}

export async function deleteMasterChartVersion(
  workspaceId: number,
  chartId: number,
  version: number,
  userId: number,
) {
  await assertMasterChartAllowed(workspaceId);

  const [chart] = await db
    .select()
    .from(masterChartsTable)
    .where(and(eq(masterChartsTable.id, chartId), eq(masterChartsTable.workspaceId, workspaceId)))
    .limit(1);
  if (!chart) throw new Error("Chart not found");

  const [ver] = await db
    .select()
    .from(masterChartVersionsTable)
    .where(and(eq(masterChartVersionsTable.chartId, chartId), eq(masterChartVersionsTable.version, version)))
    .limit(1);
  if (!ver) throw new Error("Version not found");

  await removeStoragePath(ver.storagePath);
  await db
    .delete(masterChartVersionsTable)
    .where(and(eq(masterChartVersionsTable.chartId, chartId), eq(masterChartVersionsTable.version, version)));

  const [latest] = await db
    .select({ version: masterChartVersionsTable.version })
    .from(masterChartVersionsTable)
    .where(eq(masterChartVersionsTable.chartId, chartId))
    .orderBy(desc(masterChartVersionsTable.version))
    .limit(1);

  const newCurrent = latest?.version ?? 0;
  await db
    .update(masterChartsTable)
    .set({ currentVersion: newCurrent, updatedAt: new Date() })
    .where(eq(masterChartsTable.id, chartId));

  await db.insert(activityEventsTable).values({
    userId,
    workspaceId,
    type: "master_chart_version_deleted",
    description: `Deleted master chart "${chart.name}" v${version}`,
  });

  return { currentVersion: newCurrent, deletedVersion: version };
}

export async function deleteChartContextFile(
  workspaceId: number,
  chartId: number,
  fileId: number,
) {
  await assertMasterChartAllowed(workspaceId);

  const [chart] = await db
    .select()
    .from(masterChartsTable)
    .where(and(eq(masterChartsTable.id, chartId), eq(masterChartsTable.workspaceId, workspaceId)))
    .limit(1);
  if (!chart) throw new Error("Chart not found");

  await db
    .delete(masterChartContextFilesTable)
    .where(and(eq(masterChartContextFilesTable.id, fileId), eq(masterChartContextFilesTable.chartId, chartId)));
}

export async function listCharts(workspaceId: number) {
  return db
    .select()
    .from(masterChartsTable)
    .where(eq(masterChartsTable.workspaceId, workspaceId))
    .orderBy(desc(masterChartsTable.updatedAt));
}

export async function getChartWithLatestVersion(workspaceId: number, chartId: number) {
  const [chart] = await db
    .select()
    .from(masterChartsTable)
    .where(and(eq(masterChartsTable.id, chartId), eq(masterChartsTable.workspaceId, workspaceId)))
    .limit(1);
  if (!chart) return null;

  const [version] =
    chart.currentVersion > 0
      ? await db
          .select()
          .from(masterChartVersionsTable)
          .where(
            and(
              eq(masterChartVersionsTable.chartId, chartId),
              eq(masterChartVersionsTable.version, chart.currentVersion),
            ),
          )
          .limit(1)
      : [undefined];

  const contextFiles = await listChartContextFiles(chartId);
  const versions = await listChartVersions(chartId);

  return { chart, version: version ?? null, contextFiles, versions };
}
