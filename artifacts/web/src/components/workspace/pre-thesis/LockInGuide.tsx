import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const guideKey = (workspaceId: number) => `lockInGuideShown-${workspaceId}`;

type LockInGuideProps = {
  workspaceId: number;
  visible: boolean;
  lockInRef: React.RefObject<HTMLButtonElement | null>;
};

export function LockInGuide({ workspaceId, visible, lockInRef }: LockInGuideProps) {
  const [dismissed, setDismissed] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(guideKey(workspaceId)) === "1") {
      setDismissed(true);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!visible || dismissed) return;

    const update = () => {
      const el = lockInRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setAnchor({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const t = window.setTimeout(update, 400);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.clearTimeout(t);
    };
  }, [visible, dismissed, lockInRef]);

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem(guideKey(workspaceId), "1");
  };

  const show = visible && !dismissed && anchor;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 pointer-events-none"
          aria-hidden
        >
          <svg
            className="absolute inset-0 w-full h-full overflow-visible"
            style={{ pointerEvents: "none" }}
          >
            <defs>
              <marker
                id="lockin-arrowhead"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="5"
                orient="auto"
              >
                <polygon points="0 0, 10 5, 0 10" className="fill-primary" />
              </marker>
            </defs>
            <motion.line
              x1={Math.max(48, anchor.x - 220)}
              y1={anchor.y + 120}
              x2={anchor.x}
              y2={anchor.y + 8}
              stroke="hsl(var(--primary))"
              strokeWidth="2.5"
              strokeDasharray="8 6"
              markerEnd="url(#lockin-arrowhead)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.35, ease: "easeOut" }}
            />
            <motion.circle
              cx={anchor.x}
              cy={anchor.y + 8}
              r="6"
              className="fill-primary"
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [1, 1.25, 1],
                opacity: 1,
                y: [0, -6, 0],
              }}
              transition={{
                scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
                opacity: { duration: 0.3, delay: 0.9 },
              }}
            />
          </svg>

          <motion.div
            initial={{ opacity: 0, x: -24, y: 12 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.45, delay: 0.85, ease: "easeOut" }}
            className={cn(
              "pointer-events-auto absolute max-w-sm rounded-2xl border border-primary/20",
              "bg-card/95 backdrop-blur-md shadow-xl p-4 space-y-3",
            )}
            style={{
              left: Math.max(16, anchor.x - 360),
              top: anchor.y + 48,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-primary">
                <Lock className="w-4 h-4 shrink-0" />
                <span className="text-sm font-semibold">Ready to lock in?</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={dismiss}
                aria-label="Dismiss guide"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              If your pre-thesis setup looks good, click{" "}
              <strong className="text-foreground">Lock-In</strong> above. Need changes? Use the{" "}
              <strong className="text-foreground inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-primary" /> AI Assistant
              </strong>{" "}
              on the right, then click Lock-In.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
