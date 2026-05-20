import { db } from "@workspace/db";
import {
  masterChartsTable,
  masterChartVersionsTable,
  masterChartContextFilesTable,
  workspacesTable,
  sectionsTable,
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
import { getWorkspaceAiContext } from "../lib/workspaceContext";
import { isAtLeastLocked, isWorkflowState } from "../types/workflow";
import { saveArtifactToVault } from "../lib/vaultArtifact";
import { extractDatasetContextText } from "../lib/contextExtract";
import { logger } from "../lib/logger";

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

  const extractedText = await extractDatasetContextText(
    file.buffer,
    file.mimetype,
    file.originalname,
  );

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
  const results = [];
  for (const file of files) {
    results.push(await uploadChartContextFile(workspaceId, chartId, userId, file));
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

  const { contextBlock } = await getWorkspaceAiContext(workspaceId);
  const contextFiles = await loadChartContextText(chartId);

  let methodsText = "";
  if (opts.mode === "auto_from_methods" || chart.mode === "auto_from_methods") {
    const methods = await db
      .select()
      .from(sectionsTable)
      .where(
        and(
          eq(sectionsTable.workspaceId, workspaceId),
          eq(sectionsTable.type, "methodology"),
        ),
      )
      .limit(1);
    methodsText = methods[0]?.content?.replace(/<[^>]+>/g, " ").slice(0, 4000) ?? "";
  }

  const prompt =
    opts.prompt ??
    (chart.mode === "auto_from_methods"
      ? "Generate a patient master chart template matching the study design in Methods."
      : "Generate a clinical study master chart with standard demographic and outcome columns.");

  const fullContext = `${contextBlock}\n\nMethods excerpt:\n${methodsText}\n\nUploaded dataset context:\n${contextFiles}`;

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
  const { spec, modelUsed, workbook } = await withTimeout(
    kimiGenerateSheetSpec(prompt, fullContext, currentSheet),
    KIMI_GENERATION_TIMEOUT_MS,
    "kimiGenerateSheetSpec",
  );
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

  return { chart, version: version!, spec, stats, modelUsed, vaultResourceId };
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
