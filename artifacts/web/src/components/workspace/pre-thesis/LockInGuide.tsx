import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, Lock, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

const guideKey = (workspaceId: number) => `lockInGuideShown-${workspaceId}`;

type LockInCalloutProps = {
  workspaceId: number;
  visible: boolean;
};

export function LockInGuide({ workspaceId, visible }: LockInCalloutProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(guideKey(workspaceId)) === "1") {
      setDismissed(true);
    }
  }, [workspaceId]);

  const dismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      localStorage.setItem(guideKey(workspaceId), "1");
    }
  };

  return (
    <AnimatePresence>
      {visible && !dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className={cn(
            "rounded-xl border border-primary/25 bg-primary/5 p-4",
            "flex items-start gap-3",
          )}
        >
          <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
            <ChevronUp className="w-5 h-5 text-primary animate-bounce" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-1">
              <Lock className="w-3.5 h-3.5 text-primary shrink-0" />
              Ready to lock in?
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Review the document preview below. Happy with the structure?{" "}
              <strong className="text-foreground">Click Lock-In</strong> in the button row above.
              Need changes? Use the{" "}
              <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
                <Sparkles className="w-3 h-3 text-primary" /> Customize with AI
              </span>{" "}
              button in the preview panel first, then lock in.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 mt-0.5 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-border/50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
