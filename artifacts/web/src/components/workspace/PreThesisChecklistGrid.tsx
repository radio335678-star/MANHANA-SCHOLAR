import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  PRE_THESIS_CHECKLIST_ITEMS,
  checklistProgress,
} from "@/lib/preThesisChecklist";

type PreThesisChecklistGridProps = {
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  disabled?: boolean;
  showProgress?: boolean;
};

export function PreThesisChecklistGrid({
  value,
  onChange,
  disabled = false,
  showProgress = true,
}: PreThesisChecklistGridProps) {
  const { pct } = checklistProgress(value);

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {PRE_THESIS_CHECKLIST_ITEMS.map((item) => {
          const checked = value[item.id] ?? false;
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...value, [item.id]: !checked })}
              className={cn(
                "flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all",
                checked ? "border-primary bg-primary/5" : "border-border",
                disabled && "opacity-60 cursor-not-allowed",
              )}
            >
              <div
                className={cn(
                  "w-5 h-5 rounded-full border-2 shrink-0 mt-0.5",
                  checked ? "bg-primary border-primary" : "border-border",
                )}
              />
              <div>
                <span className="font-medium text-sm">{item.label}</span>
                {item.required && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    Required
                  </Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {showProgress && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Checklist</span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>
      )}
    </div>
  );
}
