import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { SheetColumnSpec, SheetSpec, WorkbookSchema } from "@/lib/masterChartTypes";
import { getWorkbookSheets } from "@/lib/masterChartTypes";
import { Info, Table2 } from "lucide-react";
import { useState } from "react";

const TYPE_COLORS: Record<string, string> = {
  string: "bg-sky-100 text-sky-800 border-sky-200",
  number: "bg-emerald-100 text-emerald-800 border-emerald-200",
  date: "bg-amber-100 text-amber-800 border-amber-200",
};

function cellValue(row: Record<string, string | number>, col: SheetColumnSpec): string {
  const key = col.header.replace(/\s+/g, "_");
  const v = row[col.header] ?? row[key];
  if (v === undefined || v === null || v === "") return "";
  return String(v);
}

function ValidationPopover({ col }: { col: SheetColumnSpec }) {
  const v = col.validation;
  if (!v) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ml-1 inline-flex text-muted-foreground hover:text-foreground"
          aria-label={`Validation for ${col.header}`}
        >
          <Info className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="text-xs space-y-1 w-56">
        <p className="font-medium">{col.header}</p>
        {v.min != null && <p>Min: {v.min}</p>}
        {v.max != null && <p>Max: {v.max}</p>}
        {v.options?.length ? (
          <p>Options: {v.options.join(", ")}</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function MasterChartSpreadsheet({
  spec,
  highlightHeaders = [],
  className,
}: {
  spec: WorkbookSchema;
  highlightHeaders?: string[];
  className?: string;
}) {
  const sheets = getWorkbookSheets(spec);
  const [activeSheet, setActiveSheet] = useState(0);
  const safeIndex = Math.min(activeSheet, Math.max(0, sheets.length - 1));
  const viewSpec = sheets[safeIndex] ?? { columns: [], sampleRows: [] };
  const columns = viewSpec.columns ?? [];
  const rows = viewSpec.sampleRows ?? [];
  const highlightSet = new Set(highlightHeaders);

  if (columns.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center py-16 border border-dashed rounded-xl bg-muted/20 text-muted-foreground",
          className,
        )}
      >
        <Table2 className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">No spreadsheet yet</p>
        <p className="text-xs mt-1">Use the AI builder to generate your master chart</p>
      </div>
    );
  }

  return (
    <div className={cn("border rounded-xl overflow-hidden bg-card shadow-sm", className)}>
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 text-xs text-muted-foreground gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-x-auto">
          {sheets.length > 1 ? (
            sheets.map((s, i) => (
              <button
                key={`${s.name ?? "sheet"}-${i}`}
                type="button"
                onClick={() => setActiveSheet(i)}
                className={cn(
                  "shrink-0 px-2 py-1 rounded-md text-xs font-medium transition-colors",
                  safeIndex === i
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-foreground",
                )}
              >
                {(s.name ?? `Sheet ${i + 1}`).slice(0, 28)}
              </button>
            ))
          ) : (
            <span className="font-medium text-foreground">{viewSpec.name ?? spec.name ?? "Master Chart"}</span>
          )}
        </div>
        <Badge variant="secondary" className="text-xs shrink-0">
          {sheets.length > 1 ? `${sheets.length} sheets · ` : ""}
          {columns.length} cols · {rows.length} rows
        </Badge>
      </div>
      <div className="overflow-x-auto max-h-[min(420px,50vh)] overflow-y-auto">
        <table className="w-full min-w-max text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#1D4ED8] text-white">
              <th className="w-10 px-2 py-2.5 text-left text-xs font-normal border-r border-blue-600/50 bg-[#1D4ED8]">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col.header}
                  className={cn(
                    "px-3 py-2.5 text-left font-semibold whitespace-nowrap border-r border-blue-600/30 last:border-r-0",
                    highlightSet.has(col.header) && "ring-2 ring-amber-400 ring-inset animate-pulse",
                  )}
                >
                  <div className="flex items-center gap-1 flex-wrap">
                    <span>{col.header}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1 py-0 h-4 border font-normal",
                        TYPE_COLORS[col.type] ?? "bg-white/20 text-white border-white/30",
                      )}
                    >
                      {col.type}
                    </Badge>
                    <ValidationPopover col={col} />
                  </div>
                  {col.validation?.options && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {col.validation.options.slice(0, 4).map((opt) => (
                        <span
                          key={opt}
                          className="text-[9px] px-1 rounded bg-white/15 text-white/90"
                        >
                          {opt}
                        </span>
                      ))}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-4 py-8 text-center text-muted-foreground text-sm italic"
                >
                  Column schema ready — AI will populate sample rows on generate
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={i}
                  className={cn(
                    "border-t border-border/60 hover:bg-primary/5 transition-colors",
                    i % 2 === 1 && "bg-muted/20",
                  )}
                >
                  <td className="px-2 py-1.5 text-xs text-muted-foreground border-r border-border/40 bg-muted/10">
                    {i + 1}
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col.header}
                      className={cn(
                        "px-3 py-1.5 whitespace-nowrap border-r border-border/30 last:border-r-0 tabular-nums",
                        col.type === "number" && "text-right font-mono text-xs",
                        highlightSet.has(col.header) && "bg-amber-50/80",
                      )}
                    >
                      {cellValue(row, col) || (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
