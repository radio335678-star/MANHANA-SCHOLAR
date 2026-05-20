import { motion } from "framer-motion";
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
  const progressPct = STEPS.length > 1 ? (activeIdx / (STEPS.length - 1)) * 100 : 0;

  return (
    <div className="relative w-full max-w-xl pt-1">
      <div className="absolute top-[18px] left-0 right-0 h-0.5 bg-border rounded-full" />
      <motion.div
        className="absolute top-[18px] left-0 h-0.5 bg-primary rounded-full"
        initial={false}
        animate={{ width: `${progressPct}%` }}
        transition={{ type: "spring", stiffness: 200, damping: 28 }}
      />
      <div className="relative flex justify-between gap-1">
        {STEPS.map((step, i) => {
          const done = i < activeIdx;
          const current = i === activeIdx;
          return (
            <div key={step.id} className="flex flex-col items-center gap-1 min-w-0">
              <div
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors z-10 bg-background",
                  done && "border-primary bg-primary/10 text-primary",
                  current && "border-primary bg-primary text-primary-foreground shadow-md",
                  !done && !current && "border-border text-muted-foreground",
                )}
              >
                {i + 1}
              </div>
              <span
                className={cn(
                  "text-[10px] sm:text-xs font-medium text-center truncate max-w-[4.5rem]",
                  current ? "text-primary" : done ? "text-primary/80" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
