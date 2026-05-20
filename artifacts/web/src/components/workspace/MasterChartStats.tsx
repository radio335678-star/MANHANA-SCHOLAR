import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, Hash, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type NumericStat = { n?: number; mean?: number; sd?: number };

export function MasterChartStats({
  statsSummary,
  className,
}: {
  statsSummary?: Record<string, unknown> | null;
  className?: string;
}) {
  if (!statsSummary || Object.keys(statsSummary).length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>No statistics yet</p>
        <p className="text-xs mt-1">Generate a chart with numeric columns to see summary stats</p>
      </div>
    );
  }

  const columnCount = Number(statsSummary.columnCount ?? 0);
  const rowCount = Number(statsSummary.rowCount ?? 0);
  const sheetCount = Number(statsSummary.sheetCount ?? 0);

  const numericEntries = Object.entries(statsSummary).filter(
    ([key, val]) =>
      key !== "columnCount" &&
      key !== "rowCount" &&
      key !== "sheetCount" &&
      key !== "sheets" &&
      val &&
      typeof val === "object" &&
      "mean" in (val as object),
  ) as [string, NumericStat][];

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {sheetCount > 1 && (
          <StatCard
            icon={<BarChart3 className="w-4 h-4 text-emerald-600" />}
            label="Sheets"
            value={String(sheetCount)}
          />
        )}
        <StatCard
          icon={<Hash className="w-4 h-4 text-primary" />}
          label="Columns"
          value={String(columnCount)}
        />
        <StatCard
          icon={<Rows3 className="w-4 h-4 text-violet-600" />}
          label="Rows"
          value={String(rowCount)}
        />
      </div>
      {numericEntries.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {numericEntries.map(([name, s]) => (
            <Card key={name} className="border-border shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
                  {name}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-[10px] text-muted-foreground">n</p>
                    <p className="font-serif font-bold">{s.n ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Mean</p>
                    <p className="font-serif font-bold tabular-nums">{s.mean ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">SD</p>
                    <p className="font-serif font-bold tabular-nums">{s.sd ?? "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        {icon}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-xl font-serif font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
