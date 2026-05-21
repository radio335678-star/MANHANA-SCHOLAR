/**
 * Dataset Streaming Agent — mirrors the Pre-Thesis agent pattern.
 * Manages an in-memory WorkbookSpec across up to MAX_TOOL_ROUNDS Kimi calls.
 * Emits DatasetAgentEvent objects via onEvent for SSE delivery.
 */
import OpenAI from "openai";
import { db } from "@workspace/db";
import {
  masterChartsTable,
  masterChartVersionsTable,
  workspacesTable,
  eq,
  and,
  desc,
} from "@workspace/db";
import { createKimiCompletion } from "./kimiModelRouter";
import { hasKimiKey } from "./kimiTools";
import { buildAssistantToolCallMessage, extractReasoning } from "./kimiFormulaTools";
import {
  buildDatasetAgentSystemPrompt,
  buildDatasetAgentTools,
  type DatasetAgentContext,
} from "./datasetAgentPrompt";
import { applySheetPatch, validateWorkbook, workbookSummary } from "./datasetPatch";
import { buildDatasetGenerationContext, loadMethodsExcerpt } from "./datasetContext";
import { buildXlsxFromSpec, computeBasicStats } from "./excelBuilder";
import {
  uploadBuffer,
  masterChartPath,
  isStorageConfigured,
} from "./supabaseStorage";
import { saveArtifactToVault } from "./vaultArtifact";
import type { WorkbookSpec } from "./sheetGeneration";
import { logger } from "./logger";

const MAX_TOOL_ROUNDS = 6;

export type DatasetAgentEvent =
  | { type: "thinking"; content: string }
  | { type: "token"; content: string }
  | { type: "tool_start"; tool: string; message: string }
  | { type: "tool_done"; tool: string; message: string; ok: boolean }
  | { type: "sheet_updated"; workbook: WorkbookSpec; summary: string }
  | { type: "version_committed"; version: number; vaultResourceId?: number; summary: string }
  | { type: "done"; totalTokens: number; content: string }
  | { type: "error"; message: string };

type ChatHistoryItem = { role: "user" | "assistant"; content: string };

async function loadWorkingWorkbook(chartId: number): Promise<WorkbookSpec | null> {
  const [chart] = await db
    .select({ currentVersion: masterChartsTable.currentVersion })
    .from(masterChartsTable)
    .where(eq(masterChartsTable.id, chartId))
    .limit(1);

  if (!chart || chart.currentVersion === 0) return null;

  const [ver] = await db
    .select({ schemaJson: masterChartVersionsTable.schemaJson })
    .from(masterChartVersionsTable)
    .where(
      and(
        eq(masterChartVersionsTable.chartId, chartId),
        eq(masterChartVersionsTable.version, chart.currentVersion),
      ),
    )
    .limit(1);

  if (!ver?.schemaJson) return null;

  try {
    const raw = ver.schemaJson as unknown;
    if (
      raw &&
      typeof raw === "object" &&
      "sheets" in raw &&
      Array.isArray((raw as WorkbookSpec).sheets)
    ) {
      return raw as WorkbookSpec;
    }
    if (
      raw &&
      typeof raw === "object" &&
      "columns" in raw &&
      Array.isArray((raw as { columns: unknown[] }).columns)
    ) {
      const legacy = raw as { name?: string; columns: WorkbookSpec["sheets"][0]["columns"]; sampleRows?: Record<string, unknown>[] };
      return {
        name: legacy.name ?? "MasterChart",
        sheets: [{ name: legacy.name ?? "MasterChart", columns: legacy.columns, sampleRows: legacy.sampleRows ?? [] }],
      };
    }
  } catch {
    // malformed JSON — start fresh
  }
  return null;
}

async function commitVersion(
  workspaceId: number,
  chartId: number,
  userId: number,
  workbook: WorkbookSpec,
  summary: string,
  onEvent: (event: DatasetAgentEvent) => void,
): Promise<{ version: number; vaultResourceId?: number }> {
  const chart = (
    await db
      .select()
      .from(masterChartsTable)
      .where(and(eq(masterChartsTable.id, chartId), eq(masterChartsTable.workspaceId, workspaceId)))
      .limit(1)
  )[0];
  if (!chart) throw new Error("Chart not found");

  const newVersion = chart.currentVersion + 1;
  const xlsx = await buildXlsxFromSpec(workbook);
  const stats = computeBasicStats(workbook);
  const storagePath = masterChartPath(workspaceId, chartId, newVersion);

  let vaultResourceId: number | undefined;

  if (isStorageConfigured()) {
    await uploadBuffer(xlsx, storagePath, "artifacts");
    const title = `Master Chart — ${chart.name} — v${newVersion}.xlsx`;
    vaultResourceId = await saveArtifactToVault({
      workspaceId,
      userId,
      title,
      filename: `master-chart-${newVersion}.xlsx`,
      buffer: xlsx,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      activityDescription: `Dataset agent committed v${newVersion}: ${summary}`,
    });
  }

  const [version] = await db
    .insert(masterChartVersionsTable)
    .values({
      chartId,
      version: newVersion,
      storagePath,
      schemaJson: workbook as unknown as Record<string, unknown>,
      statsSummary: stats as unknown as Record<string, unknown>,
      vaultResourceId: vaultResourceId ?? null,
      modelUsed: "dataset-agent",
    })
    .returning();

  await db
    .update(masterChartsTable)
    .set({ currentVersion: newVersion, updatedAt: new Date() })
    .where(eq(masterChartsTable.id, chartId));

  onEvent({
    type: "version_committed",
    version: newVersion,
    vaultResourceId,
    summary,
  });

  logger.info({ workspaceId, chartId, version: newVersion }, "Dataset agent committed version");
  return { version: newVersion, vaultResourceId };
}

export async function runDatasetAgentChat(params: {
  workspaceId: number;
  chartId: number;
  userId: number;
  userMessage: string;
  history: ChatHistoryItem[];
  onEvent: (event: DatasetAgentEvent) => void;
}): Promise<{ assistantContent: string; totalTokens: number }> {
  const { workspaceId, chartId, userId, userMessage, history, onEvent } = params;

  if (!hasKimiKey()) {
    const msg = "AI assistant is not configured. Set KIMI_API_KEY.";
    onEvent({ type: "error", message: msg });
    return { assistantContent: msg, totalTokens: 0 };
  }

  const [chart] = await db
    .select()
    .from(masterChartsTable)
    .where(and(eq(masterChartsTable.id, chartId), eq(masterChartsTable.workspaceId, workspaceId)))
    .limit(1);
  if (!chart) {
    const msg = "Chart not found";
    onEvent({ type: "error", message: msg });
    return { assistantContent: msg, totalTokens: 0 };
  }

  const [ws] = await db
    .select({ name: workspacesTable.name, domain: workspacesTable.domain })
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);

  let workingWorkbook: WorkbookSpec | null = await loadWorkingWorkbook(chartId);
  let versionCommitted = false;

  const contextBundle = await buildDatasetGenerationContext(
    workspaceId,
    "",
    undefined,
    "",
    "Summarize available research context",
  );

  const agentCtx: DatasetAgentContext = {
    workspaceName: ws?.name ?? "Workspace",
    domain: ws?.domain ?? "Clinical Research",
    chartName: chart.name,
    chartMode: chart.mode,
    workbook: workingWorkbook,
    contextBundle: {
      hasPreThesis: contextBundle.hasPreThesis,
      hasVault: contextBundle.hasVault,
      hasUploads: contextBundle.hasUploads,
    },
  };

  const systemPrompt = buildDatasetAgentSystemPrompt(agentCtx);
  const tools = buildDatasetAgentTools();

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: userMessage },
  ];

  let totalTokens = 0;
  let assistantContent = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { result: response } = await createKimiCompletion({
      messages,
      tools,
      tool_choice: "auto",
      max_tokens: 16384,
      thinking: { type: "enabled" },
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
      thinking?: { type: "enabled" | "disabled" };
    });

    const choice = response.choices[0];
    totalTokens += response.usage?.total_tokens ?? 0;
    const msg = choice?.message;
    if (!msg) break;

    const reasoning = extractReasoning(msg);
    if (reasoning?.trim()) {
      onEvent({ type: "thinking", content: reasoning.slice(0, 2000) });
    }

    if (msg.content?.trim()) {
      assistantContent += msg.content;
      onEvent({ type: "token", content: msg.content });
    }

    const toolCalls = msg.tool_calls;
    if (!toolCalls?.length) break;

    messages.push(buildAssistantToolCallMessage(msg));

    for (const tc of toolCalls) {
      const fn = (tc as { function: { name: string; arguments: string } }).function;
      const name = fn.name;

      // ── read_sheet_state ──
      if (name === "read_sheet_state") {
        onEvent({ type: "tool_start", tool: "read_sheet_state", message: "Reading current sheet schema…" });
        let result: string;
        if (!workingWorkbook) {
          result = JSON.stringify({ status: "empty", message: "No workbook exists yet. Ask the user what columns they need or use read_context_bundle to infer the schema." });
        } else {
          const validation = validateWorkbook(workingWorkbook);
          result = JSON.stringify({
            workbookName: workingWorkbook.name,
            sheetCount: workingWorkbook.sheets.length,
            sheets: workingWorkbook.sheets.map((s) => ({
              name: s.name,
              columnCount: s.columns.length,
              rowCount: s.sampleRows?.length ?? 0,
              columns: s.columns.map((c) => ({ header: c.header, type: c.type })),
            })),
            validationSummary: validation,
          });
        }
        onEvent({ type: "tool_done", tool: "read_sheet_state", message: workingWorkbook ? `Loaded ${workingWorkbook.sheets.length} sheet(s)` : "No workbook yet", ok: true });
        messages.push({ role: "tool", tool_call_id: tc.id, content: result });
        continue;
      }

      // ── read_context_bundle ──
      if (name === "read_context_bundle") {
        onEvent({ type: "tool_start", tool: "read_context_bundle", message: "Loading workspace context…" });
        let toolResult: string;
        try {
          const methodsText = await loadMethodsExcerpt(workspaceId);
          const bundle = await buildDatasetGenerationContext(
            workspaceId,
            "",
            userMessage,
            methodsText,
            "Summarize available research context",
          );
          toolResult = JSON.stringify({
            ok: true,
            hasPreThesis: bundle.hasPreThesis,
            hasVault: bundle.hasVault,
            hasUploads: bundle.hasUploads,
            contextSnippet: bundle.fullContext.slice(0, 8000),
          });
          onEvent({ type: "tool_done", tool: "read_context_bundle", message: "Context loaded", ok: true });
        } catch (err) {
          toolResult = JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Context load failed" });
          onEvent({ type: "tool_done", tool: "read_context_bundle", message: "Context load failed", ok: false });
        }
        messages.push({ role: "tool", tool_call_id: tc.id, content: toolResult });
        continue;
      }

      // ── apply_sheet_patch ──
      if (name === "apply_sheet_patch") {
        onEvent({ type: "tool_start", tool: "apply_sheet_patch", message: "Applying sheet changes…" });
        let toolResult: string;
        let ok = true;
        try {
          const args = JSON.parse(fn.arguments || "{}") as unknown;

          if (!workingWorkbook) {
            throw new Error("No workbook exists yet. First use read_context_bundle to understand the study design, then use apply_sheet_patch with action='add_sheet' to create the initial sheet.");
          }

          const { workbook: updated, summary } = applySheetPatch(workingWorkbook, args);
          workingWorkbook = updated;

          onEvent({ type: "sheet_updated", workbook: updated, summary });
          toolResult = JSON.stringify({ ok: true, summary, state: workbookSummary(updated) });
          onEvent({ type: "tool_done", tool: "apply_sheet_patch", message: summary, ok: true });
        } catch (err) {
          ok = false;
          const errMsg = err instanceof Error ? err.message : "Patch failed";
          toolResult = JSON.stringify({ ok: false, error: errMsg });
          onEvent({ type: "tool_done", tool: "apply_sheet_patch", message: errMsg, ok: false });
        }
        messages.push({ role: "tool", tool_call_id: tc.id, content: toolResult });
        continue;
      }

      // ── validate_sheet ──
      if (name === "validate_sheet") {
        onEvent({ type: "tool_start", tool: "validate_sheet", message: "Validating workbook structure…" });
        if (!workingWorkbook) {
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({ ok: false, valid: false, issues: [{ message: "No workbook yet" }] }),
          });
          onEvent({ type: "tool_done", tool: "validate_sheet", message: "No workbook", ok: false });
          continue;
        }
        const result = validateWorkbook(workingWorkbook);
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ ok: true, ...result }) });
        onEvent({
          type: "tool_done",
          tool: "validate_sheet",
          message: result.valid
            ? `Valid — ${result.columnCount} columns, ${result.rowCount} rows, ${result.sheetCount} sheet(s)`
            : `${result.issues.length} issue(s) found`,
          ok: result.valid,
        });
        continue;
      }

      // ── commit_version ──
      if (name === "commit_version") {
        if (versionCommitted) {
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({ ok: false, error: "Version already committed in this session. Make more changes first." }),
          });
          onEvent({ type: "tool_done", tool: "commit_version", message: "Already committed", ok: false });
          continue;
        }
        if (!workingWorkbook) {
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({ ok: false, error: "No workbook to commit. Build the schema first." }),
          });
          onEvent({ type: "tool_done", tool: "commit_version", message: "No workbook", ok: false });
          continue;
        }

        onEvent({ type: "tool_start", tool: "commit_version", message: "Saving new version…" });

        let toolResult: string;
        try {
          const args = JSON.parse(fn.arguments || "{}") as { summary?: string };
          const validation = validateWorkbook(workingWorkbook);
          if (!validation.valid) {
            throw new Error(`Workbook has validation issues: ${validation.issues.map((i) => i.message).join("; ")}`);
          }
          const committed = await commitVersion(
            workspaceId,
            chartId,
            userId,
            workingWorkbook,
            args.summary ?? "Agent update",
            onEvent,
          );
          versionCommitted = true;
          toolResult = JSON.stringify({ ok: true, version: committed.version, vaultResourceId: committed.vaultResourceId });
          onEvent({ type: "tool_done", tool: "commit_version", message: `Version ${committed.version} saved`, ok: true });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Commit failed";
          toolResult = JSON.stringify({ ok: false, error: errMsg });
          onEvent({ type: "tool_done", tool: "commit_version", message: errMsg, ok: false });
        }
        messages.push({ role: "tool", tool_call_id: tc.id, content: toolResult });
        continue;
      }

      // ── unknown tool ──
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify({ ok: false, error: `Unknown tool: ${name}` }),
      });
    }
  }

  onEvent({ type: "done", totalTokens, content: assistantContent });
  return { assistantContent, totalTokens };
}
