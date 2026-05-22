/**
 * Dataset Master-Chart Analyze Panel
 *
 * Rendered on the new workspace page after Kimi analysis completes.
 * Shows must-have / good-to-have / nice-to-have master-chart recommendations
 * as selectable cards, collects the user's file-readiness choice, and an
 * optional note to the AI assistant.
 */
import { CheckCircle2, Circle, Info, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

// ── Types (mirrors server lib/datasetMasterChartPreview.ts) ──────────────────

export type DatasetChartCategory = "must_have" | "good_to_have" | "nice_to_have";

export type DatasetChartSuggestion = {
  id: string;
  name: string;
  category: DatasetChartCategory;
  reason: string;
  columnHints: string[];
  confidence: "high" | "medium" | "low";
  sourceHint?: string;
};

export type DatasetPreviewAnalysis = {
  analysisId: string;
  summary: string;
  studyDesignSignal: string;
  categories: {
    mustHave: DatasetChartSuggestion[];
    goodToHave: DatasetChartSuggestion[];
    niceToHave: DatasetChartSuggestion[];
  };
  tokensUsed: number;
};

export type FileReadinessChoice = "has_marked_files" | "needs_empty_files";

export type DatasetPlan = {
  analysisId: string;
  selectedChartIds: string[];
  selectedCharts?: DatasetChartSuggestion[];
  fileReadiness: FileReadinessChoice;
  assistantInstructions: string;
};

// ── Section header ────────────────────────────────────────────────────────────

type SectionMeta = {
  label: string;
  sublabel: string;
  badgeClass: string;
};

const SECTION_META: Record<DatasetChartCategory, SectionMeta> = {
  must_have: {
    label: "Must-have Dataset Master Charts",
    sublabel: "Core data collection sheets — required for your study.",
    badgeClass: "bg-primary/10 text-primary border-primary/20",
  },
  good_to_have: {
    label: "Good-to-have Dataset Master Charts",
    sublabel: "Strongly recommended for completeness and publication quality.",
    badgeClass: "bg-amber-500/10 text-amber-700 border-amber-300/40 dark:text-amber-400",
  },
  nice_to_have: {
    label: "Nice-to-have Dataset Master Charts",
    sublabel: "Optional enrichment — include if time and resources allow.",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
};

// ── Chart card ───────────────────────────────────────────────────────────────

function ChartCard({
  chart,
  selected,
  onToggle,
}: {
  chart: DatasetChartSuggestion;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const meta = SECTION_META[chart.category];
  return (
    <button
      type="button"
      onClick={() => onToggle(chart.id)}
      className={[
        "w-full text-left border rounded-xl px-4 py-3 transition-all",
        "hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        selected
          ? "border-primary/60 bg-primary/5 shadow-sm"
          : "border-border bg-card",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 text-primary">
          {selected ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <Circle className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-foreground leading-snug">
              {chart.name}
            </span>
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 ${meta.badgeClass}`}
            >
              {chart.confidence}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {chart.reason}
          </p>
          {chart.columnHints.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {chart.columnHints.map((h) => (
                <span
                  key={h}
                  className="text-[10px] bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 border border-border"
                >
                  {h}
                </span>
              ))}
            </div>
          )}
          {chart.sourceHint && (
            <p className="mt-1.5 text-[10px] italic text-muted-foreground/70 line-clamp-1">
              From synopsis: &ldquo;{chart.sourceHint}&rdquo;
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Section block ─────────────────────────────────────────────────────────────

function CategorySection({
  category,
  charts,
  selectedIds,
  onToggle,
}: {
  category: DatasetChartCategory;
  charts: DatasetChartSuggestion[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const meta = SECTION_META[category];
  if (charts.length === 0) return null;
  return (
    <div className="space-y-2">
      <div>
        <h4 className="font-serif font-semibold text-sm text-foreground">{meta.label}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">{meta.sublabel}</p>
      </div>
      <div className="space-y-2">
        {charts.map((c) => (
          <ChartCard
            key={c.id}
            chart={c}
            selected={selectedIds.has(c.id)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

// ── File-readiness choice ─────────────────────────────────────────────────────

function FileReadinessPicker({
  value,
  onChange,
}: {
  value: FileReadinessChoice | null;
  onChange: (v: FileReadinessChoice) => void;
}) {
  const opts: { value: FileReadinessChoice; label: string; sub: string }[] = [
    {
      value: "has_marked_files",
      label: "I have all the marked files",
      sub: "You can upload them to the master charts on the next page.",
    },
    {
      value: "needs_empty_files",
      label: "I don't have those",
      sub: "You can always create/edit related dataset master charts in the next page. This is to save your time. If you don't have them, I will create all the marked empty files ready to fill; we can do that in the next page.",
    },
  ];

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">Do you have the files for the selected charts?</p>
      {opts.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            "w-full text-left border rounded-xl px-4 py-3 transition-all",
            "hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            value === opt.value
              ? "border-primary/60 bg-primary/5 shadow-sm"
              : "border-border bg-card",
          ].join(" ")}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0 text-primary">
              {value === opt.value ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium leading-snug">{opt.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{opt.sub}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export type DatasetMasterChartAnalyzePanelProps = {
  analysis: DatasetPreviewAnalysis;
  plan: DatasetPlan;
  onPlanChange: (plan: DatasetPlan) => void;
};

export function DatasetMasterChartAnalyzePanel({
  analysis,
  plan,
  onPlanChange,
}: DatasetMasterChartAnalyzePanelProps) {
  const selectedIds = new Set(plan.selectedChartIds);

  const toggleChart = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onPlanChange({ ...plan, selectedChartIds: Array.from(next) });
  };

  const setFileReadiness = (v: FileReadinessChoice) => {
    onPlanChange({ ...plan, fileReadiness: v });
  };

  const setInstructions = (v: string) => {
    onPlanChange({ ...plan, assistantInstructions: v });
  };

  const { mustHave, goodToHave, niceToHave } = analysis.categories;

  return (
    <div className="space-y-6 border border-border rounded-xl bg-card/50 p-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div>
          <h3 className="font-serif font-semibold text-base text-foreground">
            AI Dataset Analysis
          </h3>
          {analysis.studyDesignSignal && (
            <p className="text-xs text-muted-foreground mt-1">{analysis.studyDesignSignal}</p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">{analysis.summary}</p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/40 rounded-lg px-3 py-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Select the charts you want created. Unselected charts can always be added on the next
          page.
        </span>
      </div>

      {/* Recommendation sections */}
      <div className="space-y-5">
        <CategorySection
          category="must_have"
          charts={mustHave}
          selectedIds={selectedIds}
          onToggle={toggleChart}
        />
        <CategorySection
          category="good_to_have"
          charts={goodToHave}
          selectedIds={selectedIds}
          onToggle={toggleChart}
        />
        <CategorySection
          category="nice_to_have"
          charts={niceToHave}
          selectedIds={selectedIds}
          onToggle={toggleChart}
        />
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* File readiness */}
      <FileReadinessPicker value={plan.fileReadiness} onChange={setFileReadiness} />

      {/* Divider */}
      <div className="border-t border-border" />

      {/* AI instructions */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Anything to tell the AI assistant?
        </label>
        <Textarea
          placeholder="Type here — e.g. focus on laparoscopic outcomes, exclude paediatric age group, add a separate sheet for lab values…"
          className="resize-none h-20 text-sm"
          value={plan.assistantInstructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </div>

      {/* Selection summary */}
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Badge variant="outline" className="text-xs">
          {plan.selectedChartIds.length} chart{plan.selectedChartIds.length !== 1 ? "s" : ""} selected
        </Badge>
        {plan.selectedChartIds.length === 0 && (
          <span>— select at least one chart or proceed without any.</span>
        )}
      </div>
    </div>
  );
}
