import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ChevronRight, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OpenEditorBannerProps = {
  visible: boolean;
  workspaceId: number;
  signals: {
    preThesisLocked: boolean;
    datasetReady: boolean;
    humaniserVisited: boolean;
    vaultReady: boolean;
  };
};

const STEPS = [
  { key: "preThesisLocked" as const, label: "Pre-Thesis locked" },
  { key: "datasetReady" as const, label: "Dataset" },
  { key: "humaniserVisited" as const, label: "AI Humaniser" },
  { key: "vaultReady" as const, label: "Research Vault" },
];

export function OpenEditorBanner({ visible, workspaceId, signals }: OpenEditorBannerProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl"
        >
          <div className="open-editor-banner-glow rounded-2xl border border-emerald-500/40 bg-card/95 backdrop-blur-md shadow-2xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
              {STEPS.map((step) => {
                const done = signals[step.key];
                return (
                  <span
                    key={step.key}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors",
                      done
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                        : "border-border bg-muted/50 text-muted-foreground",
                    )}
                  >
                    <CheckCircle2
                      className={cn("w-3.5 h-3.5", done ? "text-emerald-600" : "opacity-40")}
                    />
                    {step.label}
                  </span>
                );
              })}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-foreground font-medium">
                Your workspace is ready — start writing your thesis sections.
              </p>
              <Link href={`/workspaces/${workspaceId}/editor`}>
                <Button size="sm" className="gap-1.5 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-transform">
                  <Edit3 className="w-4 h-4" />
                  Open Editor
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
