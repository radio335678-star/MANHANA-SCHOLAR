import { createKimiCompletion } from "./kimiModelRouter";
import { parseModelJson } from "./kimiJsonParse";
import { getKimiApiKey } from "./kimiModels";
import { logger } from "./logger";
import type { SheetSpec } from "./kimiTools";

function hasKimiKey(): boolean {
  return Boolean(getKimiApiKey());
}

export type WorkbookSpec = {
  name: string;
  sheets: SheetSpec[];
};

const SHEET_SYSTEM = `You convert clinical/research master chart tables into Excel sheet JSON.
Return ONLY valid JSON:
{ "name": string, "columns": [{ "header": string, "type": "string"|"number"|"date" }], "sampleRows": object[] }

Rules:
- Extract EVERY row from the source table (Sl.No, OPD No., and all data columns).
- Use + and - as string values where shown in source (+ = present, - = absent).
- For checkbox-style sub-columns (e.g. M/F under Sex), use descriptive headers like "Sex_M", "Sex_F" or a single "Sex" column with M/F value.
- Include ALL columns from the source table header row.
- sampleRows must contain real data from the source — never leave sampleRows empty when source has rows.
- Column headers must be unique.`;

const WORKBOOK_SYSTEM = `You convert uploaded master chart documents into a multi-sheet Excel workbook JSON.
Return ONLY valid JSON:
{ "name": string, "sheets": [{ "name": string, "columns": [...], "sampleRows": [...] }] }

Rules:
- Create ONE sheet per distinct master chart table in the uploaded context.
- Each sheet name should be a short label from the chart title (max 31 chars, Excel-safe).
- Extract ALL rows and columns from each table — do not summarize or skip charts.
- Follow user instructions for which charts to include (default: ALL charts in context).`;

export const FALLBACK_WORKBOOK: WorkbookSpec = {
  name: "MasterChart",
  sheets: [
    {
      name: "MasterChart",
      columns: [
        { header: "PatientID", type: "string" },
        { header: "Age", type: "number", validation: { min: 0, max: 120 } },
        { header: "Sex", type: "string", validation: { options: ["M", "F", "Other"] } },
        { header: "Group", type: "string" },
        { header: "Outcome", type: "string" },
      ],
    },
  ],
};

export function isFullRebuildPrompt(prompt: string): boolean {
  return /\b(convert|build|rebuild|recreate|entire|complete|completely|from scratch|from file|from document|all charts?|proper excel|whole file|full sheet)\b/i.test(
    prompt,
  );
}

export function splitMasterChartSections(text: string): Array<{ title: string; body: string }> {
  const normalized = text.replace(/\r/g, "\n");
  const pattern = /(?:^|\n)\s*(Master\s+[Cc]hart[^\n]*)/gi;
  const matches = [...normalized.matchAll(pattern)];
  if (matches.length === 0) {
    return [{ title: "Master Chart", body: normalized.trim() }];
  }

  const sections: Array<{ title: string; body: string }> = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const title = match[1]!.trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : normalized.length;
    const body = normalized.slice(start, end).trim();
    if (body.length > 20) {
      sections.push({ title, body: `${title}\n${body}` });
    }
  }
  return sections.length > 0 ? sections : [{ title: "Master Chart", body: normalized.trim() }];
}

function sanitizeSheetName(name: string, used: Set<string>): string {
  let base = name
    .replace(/[^\w\s\-()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  if (!base) base = "Sheet";
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` ${n}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    n++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function normalizeSheet(raw: Record<string, unknown>, fallbackName: string): SheetSpec | null {
  const columns = Array.isArray(raw.columns) ? raw.columns : [];
  if (columns.length === 0) return null;
  return {
    name: typeof raw.name === "string" ? raw.name.slice(0, 31) : fallbackName,
    columns: columns as SheetSpec["columns"],
    sampleRows: Array.isArray(raw.sampleRows)
      ? (raw.sampleRows as Record<string, string | number>[])
      : [],
  };
}

function normalizeWorkbook(raw: Record<string, unknown>, defaultName: string): WorkbookSpec | null {
  if (Array.isArray(raw.sheets) && raw.sheets.length > 0) {
    const used = new Set<string>();
    const sheets: SheetSpec[] = [];
    for (const item of raw.sheets) {
      if (!item || typeof item !== "object") continue;
      const sheet = normalizeSheet(item as Record<string, unknown>, "Sheet");
      if (!sheet) continue;
      sheet.name = sanitizeSheetName(sheet.name ?? "Sheet", used);
      sheets.push(sheet);
    }
    if (sheets.length > 0) {
      return {
        name: typeof raw.name === "string" ? raw.name : defaultName,
        sheets,
      };
    }
  }

  const single = normalizeSheet(raw, defaultName);
  if (single) {
    return { name: typeof raw.name === "string" ? raw.name : defaultName, sheets: [single] };
  }
  return null;
}

async function callSheetJson(
  system: string,
  user: string,
  maxTokens: number,
): Promise<{ parsed: Record<string, unknown> | null; modelUsed: string; finishReason?: string }> {
  const { result, modelUsed } = await createKimiCompletion({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: maxTokens,
    temperature: 1,
    response_format: { type: "json_object" },
  });

  const msg = result.choices[0]?.message;
  let parsed = parseModelJson<Record<string, unknown>>(msg);
  if (!parsed && msg) {
    const { result: retry, modelUsed: retryModel } = await createKimiCompletion({
      messages: [
        { role: "system", content: "Fix and return ONLY valid JSON for the spreadsheet spec requested. No markdown." },
        {
          role: "user",
          content: `Previous output was invalid or empty. Return valid JSON for:\n${user.slice(0, 8000)}`,
        },
      ],
      max_tokens: maxTokens,
      temperature: 1,
      response_format: { type: "json_object" },
    });
    parsed = parseModelJson<Record<string, unknown>>(retry.choices[0]?.message);
    return { parsed, modelUsed: retryModel, finishReason: retry.choices[0]?.finish_reason ?? undefined };
  }

  return { parsed, modelUsed, finishReason: result.choices[0]?.finish_reason ?? undefined };
}

async function generateSingleSheet(
  sectionTitle: string,
  sectionBody: string,
  userPrompt: string,
): Promise<{ sheet: SheetSpec | null; modelUsed: string }> {
  const user = `Chart section: ${sectionTitle}

Source table data:
${sectionBody.slice(0, 24_000)}

User instruction: ${userPrompt}

Build this chart as a complete Excel sheet with all columns and all patient/subject rows from the source.`;

  const { parsed, modelUsed } = await callSheetJson(SHEET_SYSTEM, user, 8192);
  if (!parsed) {
    logger.warn({ sectionTitle }, "Single sheet JSON parse failed");
    return { sheet: null, modelUsed };
  }

  const sheet = normalizeSheet(parsed, sectionTitle.slice(0, 31));
  return { sheet, modelUsed };
}

async function generateWorkbookSinglePass(
  prompt: string,
  context: string,
  currentSheet?: SheetSpec | null,
): Promise<{ spec: WorkbookSpec; modelUsed: string }> {
  const editBlock =
    currentSheet && !isFullRebuildPrompt(prompt)
      ? `\n\nCURRENT CHART (apply user edits; preserve data unless asked to replace):\n${JSON.stringify(currentSheet, null, 2)}`
      : "";

  const contextBlock =
    context.trim().length > 0
      ? context.slice(0, 100_000)
      : "No files uploaded yet. Infer columns from the user request and standard clinical study design.";

  const user = `User request:\n${prompt || "Generate a master data chart."}

Context (research vault, pre-thesis, uploaded files — read ALL before responding):
${contextBlock}${editBlock}`;

  const { parsed, modelUsed, finishReason } = await callSheetJson(WORKBOOK_SYSTEM, user, 16384);

  if (parsed) {
    const spec = normalizeWorkbook(parsed, "Master Data Workbook");
    if (spec && spec.sheets.length > 0) {
      return { spec, modelUsed };
    }
  }

  if (finishReason === "length") {
    logger.info("Workbook single-pass truncated — falling back to chunked generation");
    throw new Error("truncated");
  }

  throw new Error("parse failed");
}

async function generateWorkbookChunked(
  prompt: string,
  context: string,
): Promise<{ spec: WorkbookSpec; modelUsed: string }> {
  const sections = splitMasterChartSections(context);
  logger.info({ sectionCount: sections.length }, "Chunked master chart generation");

  const used = new Set<string>();
  const sheets: SheetSpec[] = [];
  let lastModel = "kimi-k2.6";
  const concurrency = 3;

  for (let i = 0; i < sections.length; i += concurrency) {
    const batch = sections.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((section) => generateSingleSheet(section.title, section.body, prompt)),
    );
    for (let j = 0; j < results.length; j++) {
      const { sheet, modelUsed } = results[j]!;
      const section = batch[j]!;
      lastModel = modelUsed;
      if (!sheet) continue;
      sheet.name = sanitizeSheetName(sheet.name ?? section.title.slice(0, 31), used);
      sheets.push(sheet);
    }
  }

  if (sheets.length === 0) {
    throw new Error("No sheets generated from document sections");
  }

  return {
    spec: {
      name: "Master Data Workbook",
      sheets,
    },
    modelUsed: lastModel,
  };
}

export function workbookToLegacySpec(workbook: WorkbookSpec): SheetSpec & { sheets?: SheetSpec[] } {
  const primary = workbook.sheets[0]!;
  return {
    name: workbook.name,
    columns: primary.columns,
    sampleRows: primary.sampleRows,
    sheets: workbook.sheets,
  };
}

export function legacySpecToWorkbook(spec: SheetSpec & { sheets?: SheetSpec[] }): WorkbookSpec {
  if (spec.sheets?.length) {
    return { name: spec.name ?? "MasterChart", sheets: spec.sheets };
  }
  return {
    name: spec.name ?? "MasterChart",
    sheets: [{ name: spec.name ?? "MasterChart", columns: spec.columns ?? [], sampleRows: spec.sampleRows }],
  };
}

export async function generateWorkbookFromContext(
  prompt: string,
  context: string,
  currentSheet?: SheetSpec | null,
): Promise<{ spec: WorkbookSpec; modelUsed: string }> {
  if (!hasKimiKey()) {
    return { spec: FALLBACK_WORKBOOK, modelUsed: "template-fallback" };
  }

  const sections = splitMasterChartSections(context);
  const multiChart = sections.length > 1;
  const fullRebuild = isFullRebuildPrompt(prompt);
  const useCurrent = currentSheet && !fullRebuild ? currentSheet : null;

  if (multiChart && fullRebuild) {
    try {
      return await generateWorkbookChunked(prompt, context);
    } catch (err) {
      logger.warn({ err }, "Chunked generation failed, trying single-pass");
    }
  }

  try {
    return await generateWorkbookSinglePass(prompt, context, useCurrent);
  } catch {
    if (multiChart) {
      return generateWorkbookChunked(prompt, context);
    }
    const { sheet, modelUsed } = await generateSingleSheet("Master Chart", context, prompt);
    if (sheet) {
      return { spec: { name: "Master Data Workbook", sheets: [sheet] }, modelUsed };
    }
    logger.warn("All sheet generation strategies failed — using template fallback");
    return { spec: FALLBACK_WORKBOOK, modelUsed: "template-fallback" };
  }
}

/** Never throws — always returns a workbook (AI or template). */
export async function generateWorkbookSafe(
  prompt: string,
  context: string,
  currentSheet?: SheetSpec | null,
): Promise<{ spec: WorkbookSpec; modelUsed: string; usedFallback: boolean }> {
  try {
    const { spec, modelUsed } = await generateWorkbookFromContext(prompt, context, currentSheet);
    return { spec, modelUsed, usedFallback: modelUsed === "template-fallback" };
  } catch (err) {
    logger.error({ err }, "generateWorkbookSafe caught error — template fallback");
    return { spec: FALLBACK_WORKBOOK, modelUsed: "template-fallback", usedFallback: true };
  }
}
