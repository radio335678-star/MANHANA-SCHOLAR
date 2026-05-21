import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ChevronRight, Edit3, Minus } from "lucide-react";
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

function collapseStorageKey(workspaceId: number) {
  return `open-editor-banner-collapsed-${workspaceId}`;
}

export function OpenEditorBanner({ visible, workspaceId, signals }: OpenEditorBannerProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(collapseStorageKey(workspaceId)) === "1");
    } catch {
      setCollapsed(false);
    }
  }, [workspaceId]);

  const setCollapsedPersisted = useCallback(
    (value: boolean) => {
      setCollapsed(value);
      try {
        localStorage.setItem(collapseStorageKey(workspaceId), value ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
    [workspaceId],
  );

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
          <AnimatePresence mode="wait">
            {collapsed ? (
              <motion.button
                key="rail"
                type="button"
                initial={{ opacity: 0, scaleX: 0.6 }}
                animate={{ opacity: 1, scaleX: 1 }}
                exit={{ opacity: 0, scaleX: 0.6 }}
                transition={{ duration: 0.22 }}
                onClick={() => setCollapsedPersisted(false)}
                className="block w-full rounded-full p-0 border-0 bg-transparent cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:ring-offset-2"
                aria-label="Expand workspace status bar"
                title="Click to show workspace status"
              >
                <div className="open-editor-banner-rail shadow-sm" />
              </motion.button>
            ) : (
              <motion.div
                key="panel"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.22 }}
                className="open-editor-banner-glow relative rounded-2xl border border-emerald-500/40 bg-card/95 backdrop-blur-md shadow-2xl p-4 sm:p-5 pr-10 sm:pr-12"
              >
                <button
                  type="button"
                  onClick={() => setCollapsedPersisted(true)}
                  className={cn(
                    "absolute top-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-md",
                    "border border-border/60 bg-muted/60 text-muted-foreground",
                    "hover:bg-muted hover:text-foreground transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60",
                  )}
                  aria-label="Collapse workspace status bar"
                  title="Collapse"
                >
                  <Minus className="w-4 h-4" strokeWidth={2.5} />
                </button>

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
                    <Button
                      size="sm"
                      className="gap-1.5 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-transform"
                    >
                      <Edit3 className="w-4 h-4" />
                      Open Editor
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
