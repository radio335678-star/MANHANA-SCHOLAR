export type SheetColumnSpec = {
  header: string;
  type: "string" | "number" | "date";
  validation?: { min?: number; max?: number; options?: string[] };
};

export type SheetSpec = {
  name?: string;
  columns?: SheetColumnSpec[];
  sampleRows?: Record<string, string | number>[];
};

export type WorkbookSchema = SheetSpec & {
  sheets?: SheetSpec[];
};

export type ChartVersionPreview = {
  version: number;
  schemaJson: WorkbookSchema;
  statsSummary?: Record<string, unknown>;
  modelUsed?: string | null;
  vaultResourceId?: number | null;
};

export type ChartContextFile = {
  id: number;
  filename: string;
  extractedText?: string | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  version?: number;
  timestamp: number;
};

export function parseSheetSpec(raw: Record<string, unknown> | null | undefined): WorkbookSchema {
  if (!raw) return { columns: [], sampleRows: [] };

  const sheets = Array.isArray(raw.sheets)
    ? raw.sheets.map((s) => parseSingleSheet(s as Record<string, unknown>))
    : undefined;

  const primary = parseSingleSheet(raw);
  return {
    ...primary,
    sheets: sheets?.length ? sheets : undefined,
  };
}

function parseSingleSheet(raw: Record<string, unknown>): SheetSpec {
  return {
    name: typeof raw.name === "string" ? raw.name : undefined,
    columns: Array.isArray(raw.columns) ? (raw.columns as SheetColumnSpec[]) : [],
    sampleRows: Array.isArray(raw.sampleRows)
      ? (raw.sampleRows as Record<string, string | number>[])
      : [],
  };
}

export function getWorkbookSheets(spec: WorkbookSchema): SheetSpec[] {
  if (spec.sheets?.length) return spec.sheets;
  if (spec.columns?.length) return [spec];
  return [];
}
