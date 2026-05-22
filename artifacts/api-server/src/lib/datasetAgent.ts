/**
 * Premium Dataset Streaming Agent — standalone pipeline.
 *
 * New in this version:
 *  - Preflight feasibility gate: Kimi assesses canProceed before heavy tool loop
 *  - Hard 3-file cap: immediate user guidance when > MAX_CHART_CONTEXT_FILES uploaded
 *  - 300s timeout on preflight + agent loop (override via DATASET_AGENT_TIMEOUT_MS)
 *  - SSE heartbeat support (ping events, fired by caller)
 *  - Build-intent auto-commit: agent is required to commit when user asks to build
 *  - History trimmed to 10 messages
 *  - MAX_TOOL_ROUNDS reduced to 6 (preflight + auto-commit compensate)
 *
 * Tools: read_sheet_state | read_full_context | apply_sheet_patch |
 *        generate_sample_rows | add_formula_column | validate_sheet | commit_version
 */
import OpenAI from "openai";
import { db } from "@workspace/db";
import {
  masterChartsTable,
  masterChartVersionsTable,
  workspacesTable,
  eq,
  and,
} from "@workspace/db";
import { createKimiCompletionStreaming } from "./kimiModelRouter";
import { hasKimiKey } from "./kimiTools";
import { buildAssistantToolCallMessage } from "./kimiFormulaTools";
import {
  buildDatasetAgentSystemPrompt,
  buildDatasetPreflightPrompt,
  buildDatasetAgentTools,
  type DatasetAgentPromptContext,
  type PreflightSnapshot,
  type PreflightResult,
} from "./datasetAgentPrompt";
import { applySheetPatch, validateWorkbook, workbookSummary } from "./datasetPatch";
import {
  loadDatasetAgentContext,
  loadChartVisionFiles,
  loadChartContextFileCatalog,
  MAX_CHART_CONTEXT_FILES,
} from "./datasetContext";
import { buildXlsxFromSpec, computeBasicStats } from "./excelBuilder";
import {
  uploadBuffer,
  masterChartPath,
  isStorageConfigured,
  createSignedDownloadUrl,
} from "./supabaseStorage";
import { saveArtifactToVault } from "./vaultArtifact";
import type { WorkbookSpec } from "./sheetGeneration";
import { logger } from "./logger";

const MAX_TOOL_ROUNDS = 6;
const AGENT_TIMEOUT_MS = Number(process.env.DATASET_AGENT_TIMEOUT_MS) || 600_000;

export type DatasetAgentEvent =
  | { type: "thinking"; content: string }
  | { type: "token"; content: string }
  | { type: "tool_start"; tool: string; message: string }
  | { type: "tool_done"; tool: string; message: string; ok: boolean }
  | { type: "sheet_updated"; workbook: WorkbookSpec; summary: string }
  | { type: "version_committed"; version: number; vaultResourceId?: number; summary: string }
  | { type: "ping" }
  | { type: "done"; totalTokens: number; content: string }
  | { type: "error"; message: string };

type ChatHistoryItem = { role: "user" | "assistant"; content: string };

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s. Try with fewer files or a shorter prompt.`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Detect whether the user's message intends to build / create / generate a chart. */
function detectBuildIntent(message: string): boolean {
  return /\b(build|create|generate|make|construct|design|start|set ?up|build out|add)\b.{0,60}\b(master ?chart|chart|sheet|workbook|excel|table|dataset)\b/i.test(message)
    || /\b(master ?chart|chart|excel|workbook)\b.{0,30}\b(from|using|based on|with|for)\b/i.test(message);
}

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
      const legacy = raw as {
        name?: string;
        columns: WorkbookSpec["sheets"][0]["columns"];
        sampleRows?: Record<string, unknown>[];
      };
      return {
        name: legacy.name ?? "MasterChart",
        sheets: [{ name: legacy.name ?? "MasterChart", columns: legacy.columns, sampleRows: legacy.sampleRows ?? [] }],
      };
    }
  } catch {
    // Malformed JSON — start fresh
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
    await uploadBuffer(storagePath, xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
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

  await db.insert(masterChartVersionsTable).values({
    chartId,
    version: newVersion,
    storagePath,
    schemaJson: workbook as unknown as Record<string, unknown>,
    statsSummary: stats as unknown as Record<string, unknown>,
    vaultResourceId: vaultResourceId ?? null,
    modelUsed: "dataset-agent",
  });

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

/**
 * Generate realistic sample rows for a sheet using a provided schema.
 * Returns an array of row objects with plausible values.
 */
function generateRealisticRows(
  sheet: WorkbookSpec["sheets"][0],
  count: number,
  studyNotes: string,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i <= count; i++) {
    const row: Record<string, unknown> = {};
    for (const col of sheet.columns) {
      const h = col.header;
      const options = col.validation?.options;

      if (options?.length) {
        row[h] = options[i % options.length];
        continue;
      }

      if (col.type === "date") {
        const base = new Date(2022, 0, 1);
        base.setDate(base.getDate() + (i * 7));
        row[h] = base.toISOString().slice(0, 10);
        continue;
      }

      if (col.type === "number") {
        const hLow = h.toLowerCase();
        if (/patient.*id|pt_id/i.test(h)) { row[h] = `PT${String(i).padStart(3, "0")}`; continue; }
        if (/age/i.test(hLow)) { row[h] = 25 + (i * 7) % 40; continue; }
        if (/bmi/i.test(hLow)) { row[h] = parseFloat((18.5 + (i * 0.4) % 16.5).toFixed(1)); continue; }
        if (/height|ht/i.test(hLow)) { row[h] = 155 + (i * 3) % 30; continue; }
        if (/weight|wt/i.test(hLow)) { row[h] = 50 + (i * 2) % 40; continue; }
        if (/sbp|systolic/i.test(hLow)) { row[h] = 110 + (i * 3) % 60; continue; }
        if (/dbp|diastolic/i.test(hLow)) { row[h] = 70 + (i * 2) % 30; continue; }
        if (/hb|haemoglobin|hemoglobin/i.test(hLow)) { row[h] = parseFloat((9 + (i * 0.3) % 6).toFixed(1)); continue; }
        if (/glucose|sugar|rbs|fbs/i.test(hLow)) { row[h] = 80 + (i * 5) % 120; continue; }
        if (/creatinine/i.test(hLow)) { row[h] = parseFloat((0.6 + (i * 0.05) % 1.4).toFixed(2)); continue; }
        if (/score|scale|vas|vrs|nrs/i.test(hLow)) { row[h] = (i * 3) % 11; continue; }
        if (/duration|days|months|years/i.test(hLow)) { row[h] = 1 + (i * 3) % 60; continue; }
        // Generic number — plausible range 1–100
        row[h] = Math.round((i * 13) % 100) + 1;
        continue;
      }

      // string
      const hLow = h.toLowerCase();
      if (/patient.*id|pt_id|id/i.test(h)) { row[h] = `PT${String(i).padStart(3, "0")}`; continue; }
      if (/sex|gender/i.test(hLow)) { row[h] = i % 2 === 0 ? "M" : "F"; continue; }
      if (/group|arm|treatment/i.test(hLow)) { row[h] = i % 2 === 0 ? "Case" : "Control"; continue; }
      if (/diagnosis|diag/i.test(hLow)) { row[h] = studyNotes ? `Study case ${i}` : `Diagnosis ${i}`; continue; }
      if (/remarks|notes|comment/i.test(hLow)) { row[h] = "—"; continue; }
      row[h] = `Value_${i}`;
    }
    rows.push(row);
  }
  return rows;
}

// ── Preflight check ────────────────────────────────────────────────────────────

async function runPreflight(
  snapshot: PreflightSnapshot,
  onEvent: (event: DatasetAgentEvent) => void,
): Promise<PreflightResult> {
  onEvent({ type: "thinking", content: "Checking if I can complete this with your current files and study setup…" });

  const preflightPrompt = buildDatasetPreflightPrompt(snapshot);

  try {
    const { result: response } = await createKimiCompletionStreaming(
      {
        messages: [
          { role: "system", content: preflightPrompt },
          { role: "user", content: snapshot.userMessage },
        ],
        max_tokens: 1200,
        thinking: { type: "enabled" },
      },
      (ev) => {
        if (ev.type === "thinking") {
          onEvent({ type: "thinking", content: ev.content });
        }
      },
    );

    const raw = response.choices[0]?.message?.content?.trim() ?? "";

    // Strip markdown code fences if Kimi wrapped it
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    try {
      const parsed = JSON.parse(jsonStr) as PreflightResult;
      if (typeof parsed.canProceed === "boolean") {
        return parsed;
      }
    } catch {
      // JSON parse failed — default to proceed
    }

    // If Kimi returned non-JSON or unparseable, default to proceed
    return { canProceed: true, summary: "Analysed your request — proceeding to build." };
  } catch (err) {
    // Preflight Kimi call failed — allow main agent to proceed (degraded, not blocked)
    logger.warn({ err }, "Preflight check failed, allowing agent to proceed");
    return { canProceed: true, summary: "Ready to build your master chart." };
  }
}

// ── Main agent entry point ──────────────────────────────────────────────────

export async function runDatasetAgentChat(params: {
  workspaceId: number;
  chartId: number;
  userId: number;
  userMessage: string;
  history: ChatHistoryItem[];
  onEvent: (event: DatasetAgentEvent) => void;
}): Promise<{ assistantContent: string; totalTokens: number; versionCommitted: boolean }> {
  const { workspaceId, chartId, userId, userMessage, history, onEvent } = params;

  if (!hasKimiKey()) {
    const msg = "AI assistant is not configured. Set KIMI_API_KEY.";
    onEvent({ type: "error", message: msg });
    return { assistantContent: msg, totalTokens: 0, versionCommitted: false };
  }

  // ── 1. Fetch chart record ───────────────────────────────────────────────────
  const [chart] = await db
    .select()
    .from(masterChartsTable)
    .where(and(eq(masterChartsTable.id, chartId), eq(masterChartsTable.workspaceId, workspaceId)))
    .limit(1);
  if (!chart) {
    const msg = "Chart not found";
    onEvent({ type: "error", message: msg });
    return { assistantContent: msg, totalTokens: 0, versionCommitted: false };
  }

  // ── 2. Deterministic file-count check (no Kimi needed) ─────────────────────
  const fileCatalog = await loadChartContextFileCatalog(chartId);
  const totalFileCount = fileCatalog.length;
  const usedFiles = fileCatalog.slice(-MAX_CHART_CONTEXT_FILES); // latest N

  if (totalFileCount > MAX_CHART_CONTEXT_FILES) {
    const overMsg =
      `I can only process up to ${MAX_CHART_CONTEXT_FILES} context files at a time, but this chart has ${totalFileCount} files attached.\n\n` +
      `Please **remove ${totalFileCount - MAX_CHART_CONTEXT_FILES} file(s)** — keep only the ${MAX_CHART_CONTEXT_FILES} most relevant ones (e.g. your Group B case sheets), then send your message again.\n\n` +
      `Tip: Build the master chart with the first batch, then upload the next batch in a follow-up message.`;
    onEvent({ type: "token", content: overMsg });
    onEvent({ type: "done", totalTokens: 0, content: overMsg });
    return { assistantContent: overMsg, totalTokens: 0, versionCommitted: false };
  }

  // ── 3. Load workspace context + workbook ────────────────────────────────────
  const [ctx, workingWorkbookInit, visionFiles, wsRows] = await Promise.all([
    loadDatasetAgentContext(workspaceId, chartId),
    loadWorkingWorkbook(chartId),
    loadChartVisionFiles(chartId),
    db
      .select({ title: workspacesTable.title, domain: workspacesTable.domain })
      .from(workspacesTable)
      .where(eq(workspacesTable.id, workspaceId))
      .limit(1),
  ]);

  const buildIntentDetected = detectBuildIntent(userMessage);
  const currentVersion = chart.currentVersion;

  // ── 4. Preflight feasibility check ─────────────────────────────────────────
  const snapshot: PreflightSnapshot = {
    workspaceTitle: wsRows[0]?.title ?? ctx.workspaceTitle,
    domain: wsRows[0]?.domain ?? ctx.domain,
    chartName: chart.name,
    chartMode: chart.mode,
    workbookVersion: currentVersion,
    hasWorkbook: workingWorkbookInit !== null,
    preThesisAvailable: ctx.hasPreThesis,
    vaultFileCount: ctx.vaultCount,
    contextFiles: usedFiles.map((f) => ({ id: f.id, filename: f.filename, route: f.route })),
    contextFileCountTotal: totalFileCount,
    contextFileCountUsed: usedFiles.length,
    userMessage,
    buildIntentDetected,
  };

  const preflight = await runPreflight(snapshot, onEvent);

  if (!preflight.canProceed) {
    const reason = preflight.reason ?? "I'm not able to complete this request with the current environment.";
    const suggestions = preflight.suggestions ?? [];
    const suggestionsBlock = suggestions.length > 0
      ? `\n\nHere's what you can do:\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "";
    const declineMsg = `${reason}${suggestionsBlock}`;
    onEvent({ type: "token", content: declineMsg });
    onEvent({ type: "done", totalTokens: 0, content: declineMsg });
    logger.info({ chartId, reason: preflight.reason }, "Preflight declined");
    return { assistantContent: declineMsg, totalTokens: 0, versionCommitted: false };
  }

  // Emit one-line confirmation before entering tool loop
  if (preflight.summary) {
    onEvent({ type: "thinking", content: preflight.summary });
  }

  // ── 5. Build rich system prompt with full context embedded ──────────────────
  let workingWorkbook: WorkbookSpec | null = workingWorkbookInit;
  let versionCommitted = false;

  const visionFileCount = visionFiles.length;
  const promptCtx: DatasetAgentPromptContext = {
    chartName: chart.name,
    chartMode: chart.mode,
    workbook: workingWorkbook,
    ctx: {
      ...ctx,
      hasUploads: ctx.hasUploads || visionFileCount > 0,
    },
  };

  const systemPrompt = buildDatasetAgentSystemPrompt(promptCtx);
  const tools = buildDatasetAgentTools();

  // ── 6. Resolve signed URLs for vision files and inject vision pre-turn ──────
  type KimiImageContent = { type: "image_url"; image_url: { url: string } };
  type KimiTextContent = { type: "text"; text: string };

  const visionPreTurn: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  if (visionFileCount > 0 && isStorageConfigured()) {
    const imageContents: Array<KimiImageContent | KimiTextContent> = [];

    for (const vf of visionFiles) {
      try {
        const signedUrl = await createSignedDownloadUrl(vf.storagePath, 3600, "artifacts");
        if (signedUrl) {
          imageContents.push({ type: "image_url", image_url: { url: signedUrl } });
        }
      } catch (err) {
        logger.warn({ err, filename: vf.filename }, "Vision file signed URL failed, skipping");
      }
    }

    if (imageContents.length > 0) {
      imageContents.push({
        type: "text",
        text: `The ${imageContents.length} image(s) above are context files uploaded by the researcher for this study. They may be scanned data collection forms, proformas, observation charts, or reference images. Read them carefully — extract column names, data categories, measurement units, and study parameters visible in the images. Use this information to build the Excel master chart.`,
      });

      visionPreTurn.push(
        {
          role: "user",
          content: imageContents as OpenAI.Chat.Completions.ChatCompletionContentPart[],
        },
        {
          role: "assistant",
          content: `I have reviewed all ${imageContents.length - 1} uploaded context image(s). I can see the study data structure, column definitions, and measurement parameters. I'm ready to build the Excel master chart based on this information.`,
        },
      );

      logger.info({ chartId, visionCount: imageContents.length - 1 }, "Vision files injected into agent context");
    }
  }

  // Trim history to last 10 messages and dedupe consecutive user duplicates
  const trimmedHistory = history
    .slice(-10)
    .filter((m, idx, arr) => {
      if (m.role !== "user") return true;
      const prev = arr[idx - 1];
      return !prev || prev.role !== "user" || prev.content !== m.content;
    });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...visionPreTurn,
    ...trimmedHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: userMessage },
  ];

  let totalTokens = 0;
  let assistantContent = "";
  let agentShouldStop = false;

  const startMs = Date.now();

  function assertToolCallId(tc: { id?: string }, toolName: string): string {
    if (!tc.id?.trim()) {
      throw new Error(`Missing tool_call_id for ${toolName} — Kimi stream returned no id`);
    }
    return tc.id;
  }

  logger.info({
    chartId,
    buildIntentDetected,
    visionFileCount,
    textFileCount: totalFileCount - visionFileCount,
    contextFileCount: totalFileCount,
    historyMessages: trimmedHistory.length,
  }, "Dataset agent starting");

  // ── 7. Agentic loop (with timeout) ─────────────────────────────────────────
  const agentLoop = async () => {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const { result: response } = await createKimiCompletionStreaming(
        {
          messages,
          tools,
          tool_choice: "auto",
          max_tokens: 16384,
          thinking: { type: "enabled" },
        },
        (ev) => {
          if (ev.type === "thinking") {
            onEvent({ type: "thinking", content: ev.content });
            return;
          }
          assistantContent += ev.content;
          onEvent({ type: "token", content: ev.content });
        },
      );

      const choice = response.choices[0];
      totalTokens += response.usage?.total_tokens ?? 0;
      const msg = choice?.message;
      if (!msg) break;

      const toolCalls = msg.tool_calls;
      if (!toolCalls?.length) break;

      messages.push(buildAssistantToolCallMessage(msg));

      for (const tc of toolCalls) {
        const fn = (tc as { function: { name: string; arguments: string } }).function;
        const name = fn.name;
        const tcId = assertToolCallId(tc, name);

        // ── read_sheet_state ────────────────────────────────────────────────
        if (name === "read_sheet_state") {
          onEvent({ type: "tool_start", tool: "read_sheet_state", message: "Reading current sheet schema…" });
          let result: string;
          if (!workingWorkbook) {
            result = JSON.stringify({
              status: "empty",
              message: "No workbook exists yet. Use apply_sheet_patch with action='add_sheet' to create the first sheet.",
            });
          } else {
            const validation = validateWorkbook(workingWorkbook);
            result = JSON.stringify({
              workbookName: workingWorkbook.name,
              sheetCount: workingWorkbook.sheets.length,
              sheets: workingWorkbook.sheets.map((s) => ({
                name: s.name,
                columnCount: s.columns.length,
                rowCount: s.sampleRows?.length ?? 0,
                columns: s.columns.map((c) => ({ header: c.header, type: c.type, validation: c.validation })),
              })),
              validationSummary: validation,
            });
          }
          onEvent({
            type: "tool_done",
            tool: "read_sheet_state",
            message: workingWorkbook ? `Loaded ${workingWorkbook.sheets.length} sheet(s)` : "No workbook yet",
            ok: true,
          });
          messages.push({ role: "tool", tool_call_id: tcId, content: result });
          continue;
        }

        // ── read_full_context ───────────────────────────────────────────────
        if (name === "read_full_context") {
          onEvent({ type: "tool_start", tool: "read_full_context", message: "Loading full research context…" });
          const visionNote =
            visionFileCount > 0
              ? `\n\nNOTE: ${visionFileCount} image/scanned context file(s) were already injected directly into this conversation as vision images above — you have already reviewed them.`
              : "";
          const contextResult = JSON.stringify({
            ok: true,
            hasPreThesis: ctx.hasPreThesis,
            hasVault: ctx.hasVault,
            hasUploads: ctx.hasUploads || visionFileCount > 0,
            hasMethodology: ctx.hasMethodology,
            vaultCount: ctx.vaultCount,
            visionFilesAlreadyLoaded: visionFileCount,
            fullContext: (ctx.fullContext || "No text context available yet.") + visionNote,
          });
          onEvent({ type: "tool_done", tool: "read_full_context", message: `Full context loaded (${ctx.fullContext.length} chars${visionFileCount > 0 ? ` + ${visionFileCount} vision images` : ""})`, ok: true });
          messages.push({ role: "tool", tool_call_id: tcId, content: contextResult });
          continue;
        }

        // ── apply_sheet_patch ───────────────────────────────────────────────
        if (name === "apply_sheet_patch") {
          onEvent({ type: "tool_start", tool: "apply_sheet_patch", message: "Applying sheet changes…" });
          let toolResult: string;
          try {
            const args = JSON.parse(fn.arguments || "{}") as unknown;

            if (!workingWorkbook) {
              const action =
                args && typeof args === "object"
                  ? (args as Record<string, unknown>).action
                  : undefined;
              if (action === "add_sheet") {
                workingWorkbook = { name: chart.name, sheets: [] };
              } else {
                throw new Error(
                  "No workbook exists yet. Use apply_sheet_patch with action='add_sheet' to create the initial sheet.",
                );
              }
            }

            const { workbook: updated, summary } = applySheetPatch(workingWorkbook, args);
            workingWorkbook = updated;

            onEvent({ type: "sheet_updated", workbook: updated, summary });
            toolResult = JSON.stringify({ ok: true, summary, state: workbookSummary(updated) });
            onEvent({ type: "tool_done", tool: "apply_sheet_patch", message: summary, ok: true });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Patch failed";
            toolResult = JSON.stringify({ ok: false, error: errMsg });
            onEvent({ type: "tool_done", tool: "apply_sheet_patch", message: errMsg, ok: false });
          }
          messages.push({ role: "tool", tool_call_id: tcId, content: toolResult });
          continue;
        }

        // ── generate_sample_rows ────────────────────────────────────────────
        if (name === "generate_sample_rows") {
          onEvent({ type: "tool_start", tool: "generate_sample_rows", message: "Generating sample data…" });
          let toolResult: string;
          try {
            if (!workingWorkbook || workingWorkbook.sheets.length === 0) {
              throw new Error("No workbook sheets exist yet. Create a sheet first with apply_sheet_patch.");
            }
            const args = JSON.parse(fn.arguments || "{}") as {
              sheetIndex?: number;
              count?: number;
              studyNotes?: string;
            };
            const sheetIdx = Math.min(args.sheetIndex ?? 0, workingWorkbook.sheets.length - 1);
            const rowCount = Math.min(Math.max(args.count ?? 40, 10), 80);
            const studyNotes = args.studyNotes ?? ctx.domain ?? "";

            const generatedRows = generateRealisticRows(workingWorkbook.sheets[sheetIdx], rowCount, studyNotes);

            const { workbook: updated, summary } = applySheetPatch(workingWorkbook, {
              action: "add_rows",
              sheetIndex: sheetIdx,
              rows: generatedRows,
            });
            workingWorkbook = updated;

            onEvent({ type: "sheet_updated", workbook: updated, summary });
            toolResult = JSON.stringify({
              ok: true,
              rowsGenerated: generatedRows.length,
              sheetName: workingWorkbook.sheets[sheetIdx]?.name,
              summary,
            });
            onEvent({ type: "tool_done", tool: "generate_sample_rows", message: `Generated ${generatedRows.length} sample rows`, ok: true });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Row generation failed";
            toolResult = JSON.stringify({ ok: false, error: errMsg });
            onEvent({ type: "tool_done", tool: "generate_sample_rows", message: errMsg, ok: false });
          }
          messages.push({ role: "tool", tool_call_id: tcId, content: toolResult });
          continue;
        }

        // ── add_formula_column ──────────────────────────────────────────────
        if (name === "add_formula_column") {
          onEvent({ type: "tool_start", tool: "add_formula_column", message: "Adding formula column…" });
          let toolResult: string;
          try {
            if (!workingWorkbook || workingWorkbook.sheets.length === 0) {
              throw new Error("No workbook sheets exist yet. Create a sheet first.");
            }
            const args = JSON.parse(fn.arguments || "{}") as {
              sheetIndex?: number;
              header: string;
              formula: string;
              afterHeader?: string;
              sampleValue?: number;
            };
            if (!args.header?.trim()) throw new Error("header is required for add_formula_column");
            if (!args.formula?.trim()) throw new Error("formula is required for add_formula_column");

            const sheetIdx = Math.min(args.sheetIndex ?? 0, workingWorkbook.sheets.length - 1);

            const newCol = {
              header: args.header.trim(),
              type: "number" as const,
              validation: { formula: args.formula.trim() },
            };

            const { workbook: updated, summary } = applySheetPatch(workingWorkbook, {
              action: "add_columns",
              sheetIndex: sheetIdx,
              columns: [newCol],
              afterHeader: args.afterHeader,
            });
            workingWorkbook = updated;

            onEvent({ type: "sheet_updated", workbook: updated, summary });
            toolResult = JSON.stringify({ ok: true, summary, column: newCol.header, formula: args.formula });
            onEvent({ type: "tool_done", tool: "add_formula_column", message: `Added formula column: ${args.header}`, ok: true });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "add_formula_column failed";
            toolResult = JSON.stringify({ ok: false, error: errMsg });
            onEvent({ type: "tool_done", tool: "add_formula_column", message: errMsg, ok: false });
          }
          messages.push({ role: "tool", tool_call_id: tcId, content: toolResult });
          continue;
        }

        // ── validate_sheet ──────────────────────────────────────────────────
        if (name === "validate_sheet") {
          onEvent({ type: "tool_start", tool: "validate_sheet", message: "Validating workbook structure…" });
          if (!workingWorkbook) {
            messages.push({
              role: "tool",
              tool_call_id: tcId,
              content: JSON.stringify({ ok: false, valid: false, issues: [{ message: "No workbook yet" }] }),
            });
            onEvent({ type: "tool_done", tool: "validate_sheet", message: "No workbook", ok: false });
            continue;
          }
          const validation = validateWorkbook(workingWorkbook);

          // Auto-commit on build intent: merge result into the single tool response
          let validatePayload: Record<string, unknown> = { ok: true, ...validation };
          if (buildIntentDetected && validation.valid && !versionCommitted) {
            onEvent({ type: "tool_start", tool: "commit_version", message: "Auto-saving version (build intent)…" });
            try {
              const committed = await commitVersion(
                workspaceId,
                chartId,
                userId,
                workingWorkbook,
                "Built master chart from uploaded context",
                onEvent,
              );
              versionCommitted = true;
              agentShouldStop = true;
              validatePayload = { ...validatePayload, autoCommitted: true, version: committed.version };
              onEvent({ type: "tool_done", tool: "commit_version", message: `v${committed.version} saved`, ok: true });
              logger.info({ chartId, version: committed.version }, "Auto-committed after validate (build intent)");
              const summary = `Master chart built and saved as v${committed.version}.`;
              assistantContent += summary;
              onEvent({ type: "token", content: summary });
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : "Auto-commit failed";
              logger.warn({ err, chartId }, "Auto-commit after validate failed");
              validatePayload = { ...validatePayload, autoCommitted: false, commitError: errMsg };
              onEvent({ type: "tool_done", tool: "commit_version", message: errMsg, ok: false });
            }
          }

          // Single tool response — no extra messages, no fabricated tool_call_id
          messages.push({ role: "tool", tool_call_id: tcId, content: JSON.stringify(validatePayload) });
          onEvent({
            type: "tool_done",
            tool: "validate_sheet",
            message: validation.valid
              ? `Valid — ${validation.columnCount} columns, ${validation.rowCount} rows, ${validation.sheetCount} sheet(s)`
              : `${validation.issues.length} issue(s) found`,
            ok: validation.valid,
          });
          continue;
        }

        // ── commit_version ──────────────────────────────────────────────────
        if (name === "commit_version") {
          if (versionCommitted) {
            messages.push({
              role: "tool",
              tool_call_id: tcId,
              content: JSON.stringify({ ok: false, error: "Version already committed in this session. Make more changes first." }),
            });
            onEvent({ type: "tool_done", tool: "commit_version", message: "Already committed", ok: false });
            continue;
          }
          if (!workingWorkbook) {
            messages.push({
              role: "tool",
              tool_call_id: tcId,
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
            agentShouldStop = true;
            toolResult = JSON.stringify({ ok: true, version: committed.version, vaultResourceId: committed.vaultResourceId });
            onEvent({ type: "tool_done", tool: "commit_version", message: `Version ${committed.version} saved`, ok: true });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Commit failed";
            toolResult = JSON.stringify({ ok: false, error: errMsg });
            onEvent({ type: "tool_done", tool: "commit_version", message: errMsg, ok: false });
          }
          messages.push({ role: "tool", tool_call_id: tcId, content: toolResult });
          continue;
        }

        // ── unknown tool ────────────────────────────────────────────────────
        messages.push({
          role: "tool",
          tool_call_id: tcId,
          content: JSON.stringify({ ok: false, error: `Unknown tool: ${name}` }),
        });
      }

      if (agentShouldStop) break;
    }
  };

  try {
    await withTimeout(agentLoop(), AGENT_TIMEOUT_MS, "Dataset agent");
  } catch (err) {
    if (versionCommitted) {
      // Chart was already saved — don't surface a hard error to the client.
      const fallbackMsg = assistantContent.trim() || "Chart saved. Some follow-up steps did not complete.";
      assistantContent = fallbackMsg;
      logger.warn({ err, chartId, versionCommitted }, "Dataset agent failed after commit — treating as partial success");
      onEvent({ type: "token", content: fallbackMsg });
    } else {
      throw err;
    }
  }

  // End-of-turn auto-commit: if the workbook changed during this run but was never committed
  // (e.g. edit-only turns where the agent patches columns without an explicit commit_version call),
  // save a version now so every user message results in a persisted Excel state.
  if (!versionCommitted && workingWorkbook !== null) {
    const initColCount = workingWorkbookInit
      ? workingWorkbookInit.sheets.reduce((n, s) => n + s.columns.length, 0)
      : -1;
    const newColCount = workingWorkbook.sheets.reduce((n, s) => n + s.columns.length, 0);
    const initRowCount = workingWorkbookInit
      ? workingWorkbookInit.sheets.reduce((n, s) => n + (s.sampleRows?.length ?? 0), 0)
      : -1;
    const newRowCount = workingWorkbook.sheets.reduce((n, s) => n + (s.sampleRows?.length ?? 0), 0);
    const initSheetCount = workingWorkbookInit?.sheets.length ?? -1;
    const newSheetCount = workingWorkbook.sheets.length;
    const workbookChanged =
      newSheetCount !== initSheetCount ||
      newColCount !== initColCount ||
      newRowCount !== initRowCount;

    if (workbookChanged) {
      const validation = validateWorkbook(workingWorkbook);
      if (validation.valid) {
        try {
          await commitVersion(
            workspaceId,
            chartId,
            userId,
            workingWorkbook,
            "Auto-saved after chat turn",
            onEvent,
          );
          versionCommitted = true;
        } catch (commitErr) {
          logger.warn({ commitErr, chartId }, "End-of-turn auto-commit failed — changes not persisted");
        }
      }
    }
  }

  logger.info({
    chartId,
    roundsApprox: Math.ceil((Date.now() - startMs) / 1000),
    totalTokens,
    versionCommitted,
    durationMs: Date.now() - startMs,
    buildIntentDetected,
  }, "Dataset agent completed");

  onEvent({ type: "done", totalTokens, content: assistantContent });
  return { assistantContent, totalTokens, versionCommitted };
}
