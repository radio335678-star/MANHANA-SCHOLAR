import ExcelJS from "exceljs";
import type { SheetSpec } from "./kimiTools";

export type WorkbookSpec = {
  name: string;
  sheets: SheetSpec[];
};

export function legacySpecToWorkbook(spec: SheetSpec & { sheets?: SheetSpec[] }): WorkbookSpec {
  if (spec.sheets?.length) {
    return { name: spec.name ?? "MasterChart", sheets: spec.sheets };
  }
  return {
    name: spec.name ?? "MasterChart",
    sheets: [{ name: spec.name ?? "MasterChart", columns: spec.columns ?? [], sampleRows: spec.sampleRows }],
  };
}

function addSheetToWorkbook(workbook: ExcelJS.Workbook, spec: SheetSpec): void {
  const sheetName = (spec.name ?? "MasterChart").slice(0, 31) || "MasterChart";
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = spec.columns.map((c) => ({
    header: c.header,
    key: c.header.replace(/\s+/g, "_"),
    width: 18,
  }));

  if (spec.sampleRows?.length) {
    for (const row of spec.sampleRows) {
      const values: Record<string, string | number> = {};
      for (const col of spec.columns) {
        const key = col.header.replace(/\s+/g, "_");
        values[key] = row[col.header] ?? row[key] ?? "";
      }
      sheet.addRow(values);
    }
  }

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1D4ED8" },
  };
}

export async function buildXlsxFromSpec(
  spec: SheetSpec | (SheetSpec & { sheets?: SheetSpec[] }) | WorkbookSpec,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const wb =
    "sheets" in spec && Array.isArray(spec.sheets) && spec.sheets.length > 0
      ? legacySpecToWorkbook(spec as SheetSpec & { sheets?: SheetSpec[] })
      : legacySpecToWorkbook(spec as SheetSpec);

  for (const sheetSpec of wb.sheets) {
    addSheetToWorkbook(workbook, sheetSpec);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function parseXlsx(buffer: Buffer): Promise<SheetSpec> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { name: "Uploaded", columns: [{ header: "Column1", type: "string" }] };
  }

  const headerRow = sheet.getRow(1);
  const columns: SheetSpec["columns"] = [];
  headerRow.eachCell((cell, colNumber) => {
    const header = String(cell.value ?? `Col${colNumber}`);
    columns.push({ header, type: "string" });
  });

  const sampleRows: Record<string, string | number>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, string | number> = {};
    row.eachCell((cell, colNumber) => {
      const header = columns[colNumber - 1]?.header ?? `Col${colNumber}`;
      obj[header] = cell.value as string | number;
    });
    if (Object.keys(obj).length) sampleRows.push(obj);
  });

  return { name: sheet.name, columns, sampleRows: sampleRows.slice(0, 100) };
}

export function computeBasicStats(spec: SheetSpec & { sheets?: SheetSpec[] }): Record<string, unknown> {
  const sheets = spec.sheets?.length ? spec.sheets : [spec];
  let totalRows = 0;
  let totalCols = 0;
  const sheetStats: Record<string, unknown>[] = [];

  for (const sheet of sheets) {
    const numericCols = sheet.columns.filter((c) => c.type === "number");
    const rowCount = sheet.sampleRows?.length ?? 0;
    const colCount = sheet.columns.length;
    totalRows += rowCount;
    totalCols += colCount;

    const stats: Record<string, unknown> = { name: sheet.name, columnCount: colCount, rowCount };
    for (const col of numericCols) {
      const values = (sheet.sampleRows ?? [])
        .map((r) => Number(r[col.header]))
        .filter((n) => !Number.isNaN(n));
      if (values.length === 0) continue;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
      stats[col.header] = {
        n: values.length,
        mean: Math.round(mean * 1000) / 1000,
        sd: Math.round(Math.sqrt(variance) * 1000) / 1000,
      };
    }
    sheetStats.push(stats);
  }

  return {
    columnCount: totalCols,
    rowCount: totalRows,
    sheetCount: sheets.length,
    sheets: sheetStats,
  };
}
