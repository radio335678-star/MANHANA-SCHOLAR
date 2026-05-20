import { cn } from "@/lib/utils";

const STEPS = [
  { id: "init", label: "Created" },
  { id: "pre_setup", label: "Pre-Thesis" },
  { id: "locked_in", label: "Locked" },
  { id: "section_build", label: "Writing" },
  { id: "review", label: "Review" },
  { id: "complete", label: "Complete" },
] as const;

export function WorkflowStepper({ currentState }: { currentState: string }) {
  const idx = STEPS.findIndex((s) => s.id === currentState);
  const activeIdx = idx >= 0 ? idx : 0;

  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {STEPS.map((step, i) => {
        const done = i < activeIdx;
        const current = i === activeIdx;
        return (
          <span key={step.id} className="flex items-center gap-1">
            <span
              className={cn(
                "px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap",
                done && "bg-primary/10 text-primary",
                current && "bg-primary text-primary-foreground",
                !done && !current && "bg-muted text-muted-foreground",
              )}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <span className={cn("text-border font-bold", done && "text-primary/50")}>›</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
