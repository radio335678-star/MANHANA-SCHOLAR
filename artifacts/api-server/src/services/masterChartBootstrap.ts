import { db } from "@workspace/db";
import {
  masterChartsTable,
  masterChartVersionsTable,
  activityEventsTable,
} from "@workspace/db";
import { and, eq } from "@workspace/db";
import { buildXlsxFromSpec } from "../lib/excelBuilder";
import { uploadBuffer, masterChartPath, isStorageConfigured } from "../lib/supabaseStorage";
import { saveArtifactToVault } from "../lib/vaultArtifact";
import { logger } from "../lib/logger";

type SelectedChart = {
  id?: string;
  name: string;
  category?: string;
  columnHints?: string[];
};

type DatasetMasterChartPlan = {
  fileReadiness?: "has_marked_files" | "needs_empty_files";
  selectedCharts?: SelectedChart[];
  analysisId?: string;
};

export type BootstrapChartResult = {
  chartId: number;
  name: string;
  serialNo: number;
  version: number;
  vaultResourceId?: number;
};

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?:[\]]/g, "_").slice(0, 31) || "MasterChart";
}

function inferColumnType(hint: string): "string" | "number" | "date" {
  const lower = hint.toLowerCase();
  if (/date|dob|admission|discharge|follow.?up/.test(lower)) return "date";
  if (/age|weight|height|bp|pressure|count|no\.|sr\.?no|score|value|result|level|days|weeks|months|dose/.test(lower)) return "number";
  return "string";
}

function buildEmptySheetSpec(chart: SelectedChart) {
  const rawHints = chart.columnHints?.length
    ? chart.columnHints
    : ["Sr.No", "Patient ID", "Name", "Age", "Gender", "Date of Admission", "Diagnosis", "Outcome"];

  const columns = rawHints.map((hint) => ({
    header: hint,
    type: inferColumnType(hint),
  }));

  return {
    name: sanitizeSheetName(chart.name),
    columns,
    sampleRows: [],
  };
}

export async function bootstrapMasterCharts(
  input: {
    workspaceId: number;
    userId: number;
    plan: Record<string, unknown> | null | undefined;
  },
  onProgress?: (msg: string) => void,
): Promise<BootstrapChartResult[]> {
  const { workspaceId, userId, plan } = input;

  if (!plan) {
    return [];
  }

  const typedPlan = plan as DatasetMasterChartPlan;

  if (typedPlan.fileReadiness !== "needs_empty_files") {
    return [];
  }

  const selectedCharts = typedPlan.selectedCharts ?? [];
  if (selectedCharts.length === 0) {
    return [];
  }

  const analysisId = typedPlan.analysisId ?? "unknown";
  const results: BootstrapChartResult[] = [];

  for (let i = 0; i < selectedCharts.length; i++) {
    const chart = selectedCharts[i]!;
    const serialNo = i + 1;

    onProgress?.(`Creating chart shell ${serialNo}/${selectedCharts.length}: ${chart.name}`);

    try {
      // Idempotency: skip if chart with same analysisId + name was already bootstrapped
      const existingForChart = await db
        .select({ id: masterChartsTable.id, name: masterChartsTable.name, studyDesign: masterChartsTable.studyDesign })
        .from(masterChartsTable)
        .where(and(eq(masterChartsTable.workspaceId, workspaceId)));

      const duplicate = existingForChart.find((row) => {
        const sd = row.studyDesign as Record<string, unknown> | null;
        return sd?.analysisId === analysisId && row.name === chart.name;
      });

      if (duplicate) {
        onProgress?.(`Skipping duplicate: ${chart.name} (already bootstrapped)`);
        continue;
      }

      const spec = buildEmptySheetSpec(chart);
      const xlsx = await buildXlsxFromSpec(spec);

      // Insert chart row — bypassing assertMasterChartAllowed for bootstrap context
      const [chartRow] = await db
        .insert(masterChartsTable)
        .values({
          workspaceId,
          name: chart.name,
          mode: "chat_to_excel" as const,
          currentVersion: 1,
          studyDesign: {
            bootstrapSerialNo: serialNo,
            analysisId,
            planChartId: chart.id ?? null,
            fileReadiness: "needs_empty_files",
            createdByAgent: "agent_8",
          },
        })
        .returning();

      if (!chartRow) {
        logger.warn({ workspaceId, chartName: chart.name }, "Chart insert returned nothing");
        continue;
      }

      const storagePath = masterChartPath(workspaceId, chartRow.id, 1);

      if (isStorageConfigured()) {
        await uploadBuffer(storagePath, xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      }

      const vaultResourceId = await saveArtifactToVault({
        workspaceId,
        userId,
        title: `Master Chart — ${chart.name} — v1.xlsx`,
        filename: `master-chart-${chart.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}-v1.xlsx`,
        buffer: xlsx,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        activityDescription: `Master chart shell created by Agent 8: "${chart.name}" (Sr.No ${serialNo})`,
      });

      const [versionRow] = await db
        .insert(masterChartVersionsTable)
        .values({
          chartId: chartRow.id,
          version: 1,
          storagePath,
          schemaJson: spec as unknown as Record<string, unknown>,
          statsSummary: { columnCount: spec.columns.length, rowCount: 0, source: "bootstrap" },
          vaultResourceId: vaultResourceId ?? null,
          modelUsed: "bootstrap_agent_8",
        })
        .returning();

      await db.insert(activityEventsTable).values({
        userId,
        workspaceId,
        type: "master_chart_created",
        description: `Empty master chart shell created: "${chart.name}" (Sr.No ${serialNo}, v1) via Agent 8`,
      });

      results.push({
        chartId: chartRow.id,
        name: chart.name,
        serialNo,
        version: 1,
        vaultResourceId,
      });

      logger.info({ workspaceId, chartId: chartRow.id, name: chart.name, serialNo }, "Bootstrap chart shell created");
    } catch (err) {
      logger.warn({ err, workspaceId, chartName: chart.name }, "Failed to bootstrap chart shell");
      onProgress?.(`Warning: Failed to create chart shell for "${chart.name}": ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return results;
}
