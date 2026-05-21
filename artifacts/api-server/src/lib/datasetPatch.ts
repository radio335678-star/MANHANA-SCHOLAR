/**
 * Structured, Zod-validated patch operations for WorkbookSpec.
 * Each operation is a pure function returning a new WorkbookSpec.
 * The agent calls applySheetPatch; bad args throw so the agent can retry.
 */
import { z } from "zod";
import type { WorkbookSpec } from "./sheetGeneration";
import type { SheetSpec } from "./kimiTools";

const ColumnSpecSchema = z.object({
  header: z.string().min(1),
  type: z.enum(["string", "number", "date"]),
  validation: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      options: z.array(z.string()).optional(),
    })
    .optional(),
});

const SheetSpecSchema = z.object({
  name: z.string().min(1).max(31),
  columns: z.array(ColumnSpecSchema).min(1),
  sampleRows: z
    .array(z.record(z.union([z.string(), z.number()])))
    .optional()
    .default([]),
});

const ValidationSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(z.string()).optional(),
});

export const SheetPatchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add_columns"),
    sheetIndex: z.number().int().min(0).default(0),
    columns: z.array(ColumnSpecSchema).min(1),
    afterHeader: z.string().optional(),
  }),
  z.object({
    action: z.literal("remove_columns"),
    sheetIndex: z.number().int().min(0).default(0),
    headers: z.array(z.string()).min(1),
  }),
  z.object({
    action: z.literal("rename_column"),
    sheetIndex: z.number().int().min(0).default(0),
    from: z.string().min(1),
    to: z.string().min(1),
  }),
  z.object({
    action: z.literal("add_rows"),
    sheetIndex: z.number().int().min(0).default(0),
    rows: z.array(z.record(z.union([z.string(), z.number()]))).min(1),
  }),
  z.object({
    action: z.literal("remove_rows"),
    sheetIndex: z.number().int().min(0).default(0),
    indices: z.array(z.number().int().min(0)).min(1),
  }),
  z.object({
    action: z.literal("add_sheet"),
    sheet: SheetSpecSchema,
  }),
  z.object({
    action: z.literal("remove_sheet"),
    sheetIndex: z.number().int().min(0),
  }),
  z.object({
    action: z.literal("set_validation"),
    sheetIndex: z.number().int().min(0).default(0),
    header: z.string().min(1),
    validation: ValidationSchema,
  }),
  z.object({
    action: z.literal("reorder_columns"),
    sheetIndex: z.number().int().min(0).default(0),
    order: z.array(z.string()).min(1),
  }),
  z.object({
    action: z.literal("replace_sheet"),
    sheetIndex: z.number().int().min(0).default(0),
    sheet: SheetSpecSchema,
  }),
  z.object({
    action: z.literal("rename_sheet"),
    sheetIndex: z.number().int().min(0).default(0),
    name: z.string().min(1).max(31),
  }),
  z.object({
    action: z.literal("generate_rows"),
    sheetIndex: z.number().int().min(0).default(0),
    count: z.number().int().min(1).max(200).default(20),
    context: z.string().optional(),
  }),
]);

export type SheetPatch = z.infer<typeof SheetPatchSchema>;

export type PatchResult = {
  workbook: WorkbookSpec;
  summary: string;
};

export type ValidationIssue = {
  sheetIndex: number;
  sheetName: string;
  type: "duplicate_header" | "empty_sheet" | "name_conflict" | "missing_columns" | "invalid_row_data";
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
  columnCount: number;
  rowCount: number;
  sheetCount: number;
};

function cloneWorkbook(wb: WorkbookSpec): WorkbookSpec {
  return {
    name: wb.name,
    sheets: wb.sheets.map((s) => ({
      name: s.name,
      columns: s.columns.map((c) => ({ ...c, validation: c.validation ? { ...c.validation } : undefined })),
      sampleRows: s.sampleRows ? s.sampleRows.map((r) => ({ ...r })) : [],
    })),
  };
}

function getSheet(wb: WorkbookSpec, idx: number): SheetSpec {
  const sheet = wb.sheets[idx];
  if (!sheet) throw new Error(`Sheet index ${idx} does not exist (workbook has ${wb.sheets.length} sheet(s))`);
  return sheet;
}

function ensureUniqueSheetNames(sheets: SheetSpec[]): void {
  const seen = new Set<string>();
  for (const s of sheets) {
    const key = s.name.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate sheet name: "${s.name}"`);
    seen.add(key);
  }
}

function ensureUniqueColumnHeaders(columns: SheetSpec["columns"]): void {
  const seen = new Set<string>();
  for (const c of columns) {
    if (seen.has(c.header.toLowerCase())) {
      throw new Error(`Duplicate column header: "${c.header}"`);
    }
    seen.add(c.header.toLowerCase());
  }
}

export function applySheetPatch(workbook: WorkbookSpec, rawPatch: unknown): PatchResult {
  const parsed = SheetPatchSchema.safeParse(rawPatch);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid patch: ${msg}`);
  }

  const patch = parsed.data;
  const wb = cloneWorkbook(workbook);

  switch (patch.action) {
    case "add_columns": {
      const sheet = getSheet(wb, patch.sheetIndex);
      const afterIdx = patch.afterHeader
        ? sheet.columns.findIndex((c) => c.header === patch.afterHeader)
        : -1;
      const insertAt = afterIdx >= 0 ? afterIdx + 1 : sheet.columns.length;
      sheet.columns.splice(insertAt, 0, ...patch.columns);
      ensureUniqueColumnHeaders(sheet.columns);
      return {
        workbook: wb,
        summary: `Added ${patch.columns.length} column(s) to sheet "${sheet.name}": ${patch.columns.map((c) => c.header).join(", ")}`,
      };
    }

    case "remove_columns": {
      const sheet = getSheet(wb, patch.sheetIndex);
      const toRemove = new Set(patch.headers.map((h) => h.toLowerCase()));
      const removed = sheet.columns.filter((c) => toRemove.has(c.header.toLowerCase()));
      if (removed.length === 0) throw new Error(`None of the specified columns found: ${patch.headers.join(", ")}`);
      sheet.columns = sheet.columns.filter((c) => !toRemove.has(c.header.toLowerCase()));
      sheet.sampleRows = (sheet.sampleRows ?? []).map((row) => {
        const r = { ...row };
        for (const h of patch.headers) delete r[h];
        return r;
      });
      return {
        workbook: wb,
        summary: `Removed ${removed.length} column(s) from sheet "${sheet.name}": ${removed.map((c) => c.header).join(", ")}`,
      };
    }

    case "rename_column": {
      const sheet = getSheet(wb, patch.sheetIndex);
      const col = sheet.columns.find((c) => c.header.toLowerCase() === patch.from.toLowerCase());
      if (!col) throw new Error(`Column "${patch.from}" not found in sheet "${sheet.name}"`);
      const existing = sheet.columns.find(
        (c) => c.header.toLowerCase() === patch.to.toLowerCase() && c !== col,
      );
      if (existing) throw new Error(`Column "${patch.to}" already exists in sheet "${sheet.name}"`);
      const oldName = col.header;
      col.header = patch.to;
      sheet.sampleRows = (sheet.sampleRows ?? []).map((row) => {
        const r = { ...row };
        if (oldName in r) {
          r[patch.to] = r[oldName]!;
          delete r[oldName];
        }
        return r;
      });
      return {
        workbook: wb,
        summary: `Renamed column "${patch.from}" → "${patch.to}" in sheet "${sheet.name}"`,
      };
    }

    case "add_rows": {
      const sheet = getSheet(wb, patch.sheetIndex);
      sheet.sampleRows = [...(sheet.sampleRows ?? []), ...patch.rows];
      return {
        workbook: wb,
        summary: `Added ${patch.rows.length} row(s) to sheet "${sheet.name}" (total: ${sheet.sampleRows.length})`,
      };
    }

    case "remove_rows": {
      const sheet = getSheet(wb, patch.sheetIndex);
      const toRemove = new Set(patch.indices);
      const before = (sheet.sampleRows ?? []).length;
      sheet.sampleRows = (sheet.sampleRows ?? []).filter((_, i) => !toRemove.has(i));
      return {
        workbook: wb,
        summary: `Removed ${before - sheet.sampleRows.length} row(s) from sheet "${sheet.name}"`,
      };
    }

    case "add_sheet": {
      const newSheet: SheetSpec = {
        name: patch.sheet.name,
        columns: patch.sheet.columns,
        sampleRows: patch.sheet.sampleRows ?? [],
      };
      wb.sheets.push(newSheet);
      ensureUniqueSheetNames(wb.sheets);
      return {
        workbook: wb,
        summary: `Added new sheet "${newSheet.name}" with ${newSheet.columns.length} columns`,
      };
    }

    case "remove_sheet": {
      if (wb.sheets.length <= 1) throw new Error("Cannot remove the only sheet in the workbook");
      const removed = getSheet(wb, patch.sheetIndex);
      wb.sheets.splice(patch.sheetIndex, 1);
      return {
        workbook: wb,
        summary: `Removed sheet "${removed.name}"`,
      };
    }

    case "set_validation": {
      const sheet = getSheet(wb, patch.sheetIndex);
      const col = sheet.columns.find((c) => c.header.toLowerCase() === patch.header.toLowerCase());
      if (!col) throw new Error(`Column "${patch.header}" not found in sheet "${sheet.name}"`);
      col.validation = patch.validation;
      return {
        workbook: wb,
        summary: `Set validation on column "${col.header}" in sheet "${sheet.name}"`,
      };
    }

    case "reorder_columns": {
      const sheet = getSheet(wb, patch.sheetIndex);
      const headerMap = new Map(sheet.columns.map((c) => [c.header.toLowerCase(), c]));
      const reordered = patch.order.map((h) => {
        const col = headerMap.get(h.toLowerCase());
        if (!col) throw new Error(`Column "${h}" not found in sheet "${sheet.name}"`);
        return col;
      });
      const remaining = sheet.columns.filter(
        (c) => !patch.order.some((h) => h.toLowerCase() === c.header.toLowerCase()),
      );
      sheet.columns = [...reordered, ...remaining];
      return {
        workbook: wb,
        summary: `Reordered columns in sheet "${sheet.name}"`,
      };
    }

    case "replace_sheet": {
      const old = getSheet(wb, patch.sheetIndex);
      wb.sheets[patch.sheetIndex] = {
        name: patch.sheet.name,
        columns: patch.sheet.columns,
        sampleRows: patch.sheet.sampleRows ?? [],
      };
      return {
        workbook: wb,
        summary: `Replaced sheet "${old.name}" with "${patch.sheet.name}" (${patch.sheet.columns.length} columns)`,
      };
    }

    case "rename_sheet": {
      const sheet = getSheet(wb, patch.sheetIndex);
      const oldName = sheet.name;
      sheet.name = patch.name;
      ensureUniqueSheetNames(wb.sheets);
      return {
        workbook: wb,
        summary: `Renamed sheet "${oldName}" → "${patch.name}"`,
      };
    }

    case "generate_rows": {
      // Placeholder — agent uses read_context_bundle + full generation for this
      return {
        workbook: wb,
        summary: `generate_rows: use the main prompt to ask the AI to add sample data rows`,
      };
    }
  }
}

export function validateWorkbook(workbook: WorkbookSpec): ValidationResult {
  const issues: ValidationIssue[] = [];
  let totalRows = 0;
  let totalCols = 0;

  const sheetNames = new Set<string>();
  for (let si = 0; si < workbook.sheets.length; si++) {
    const sheet = workbook.sheets[si]!;
    const sheetKey = sheet.name.toLowerCase();

    if (sheetNames.has(sheetKey)) {
      issues.push({
        sheetIndex: si,
        sheetName: sheet.name,
        type: "name_conflict",
        message: `Duplicate sheet name: "${sheet.name}"`,
      });
    }
    sheetNames.add(sheetKey);

    if (!sheet.columns || sheet.columns.length === 0) {
      issues.push({
        sheetIndex: si,
        sheetName: sheet.name,
        type: "empty_sheet",
        message: `Sheet "${sheet.name}" has no columns`,
      });
      continue;
    }

    const colHeaders = new Set<string>();
    for (const col of sheet.columns) {
      if (colHeaders.has(col.header.toLowerCase())) {
        issues.push({
          sheetIndex: si,
          sheetName: sheet.name,
          type: "duplicate_header",
          message: `Duplicate column header "${col.header}" in sheet "${sheet.name}"`,
        });
      }
      colHeaders.add(col.header.toLowerCase());
    }

    totalCols += sheet.columns.length;
    totalRows += sheet.sampleRows?.length ?? 0;
  }

  return {
    valid: issues.length === 0,
    issues,
    columnCount: totalCols,
    rowCount: totalRows,
    sheetCount: workbook.sheets.length,
  };
}

export function workbookSummary(workbook: WorkbookSpec): string {
  const sheets = workbook.sheets.map((s) => ({
    name: s.name,
    columns: s.columns.length,
    rows: s.sampleRows?.length ?? 0,
  }));
  return JSON.stringify({ workbookName: workbook.name, sheets });
}
