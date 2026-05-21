import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
  ArrowLeft,
  PenTool,
  Activity,
  FileText,
  Download,
  Edit3,
  Loader2,
  Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { mainAreaFixedCn } from "@/lib/main-area-inset";
import { useSidebar } from "@/components/ui/sidebar";
import { WorkflowStepper } from "@/components/workspace/WorkflowStepper";
import { WorkspaceCardMenu } from "@/components/workspace/WorkspaceCardMenu";

type WorkspaceHeaderWorkspace = {
  id: number;
  title: string;
  domain: string;
  qualification?: string | null;
  status: string;
  description?: string | null;
  guideName?: string | null;
  coGuideName?: string | null;
  state?: string | null;
  updatedAt: string;
};

type WorkspaceHeaderCardProps = {
  workspace: WorkspaceHeaderWorkspace;
  workflowState: string;
  totalWords: number;
  estPages: number;
  exporting: boolean;
  onExport: () => void;
};

function collapseStorageKey(workspaceId: number) {
  return `workspace-header-collapsed-${workspaceId}`;
}

export function WorkspaceHeaderCard({
  workspace,
  workflowState,
  totalWords,
  estPages,
  exporting,
  onExport,
}: WorkspaceHeaderCardProps) {
  const { isMobile, state: sidebarState } = useSidebar();
  const sidebarCollapsed = sidebarState === "collapsed";
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(collapseStorageKey(workspace.id)) === "1");
    } catch {
      setCollapsed(false);
    }
  }, [workspace.id]);

  const setCollapsedPersisted = useCallback(
    (value: boolean) => {
      setCollapsed(value);
      try {
        localStorage.setItem(collapseStorageKey(workspace.id), value ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
    [workspace.id],
  );

  return (
    <AnimatePresence mode="wait">
      {collapsed ? (
        <>
          <motion.button
            key="header-rail"
            type="button"
            initial={{ opacity: 0, scaleX: 0.85 }}
            animate={{ opacity: 1, scaleX: 1 }}
            exit={{ opacity: 0, scaleX: 0.85 }}
            transition={{ duration: 0.22 }}
            onClick={() => setCollapsedPersisted(false)}
            className={cn(
              mainAreaFixedCn(isMobile, sidebarCollapsed, "top"),
              "block max-w-none rounded-none p-0 border-0 bg-transparent cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60",
            )}
            aria-label="Expand workspace header"
            title="Click to show thesis header"
          >
            <div className="workspace-header-rail" />
          </motion.button>
          <div className="h-1.5 w-full shrink-0" aria-hidden />
        </>
      ) : (
        <motion.div
          key="header-panel"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22 }}
          className="relative flex items-start gap-4 rounded-2xl border border-border/60 bg-gradient-to-br from-primary/[0.05] via-background to-background p-5 sm:p-6 shadow-sm overflow-hidden"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,hsl(var(--primary)/0.07),transparent_60%)] pointer-events-none" />
          <Link href="/workspaces">
            <Button
              variant="ghost"
              size="icon"
              className="relative z-10 shrink-0 text-muted-foreground hover:text-foreground mt-0.5"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="relative z-10 flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-medium">
                {workspace.domain}
              </Badge>
              {workspace.qualification && (
                <Badge variant="outline" className="font-medium">
                  {workspace.qualification}
                </Badge>
              )}
              <Badge
                variant="outline"
                className={cn(
                  "capitalize font-medium",
                  workspace.status === "active"
                    ? "border-primary/30 text-primary bg-primary/5"
                    : workspace.status === "completed"
                      ? "border-green-300 text-green-700 bg-green-50"
                      : "border-border text-muted-foreground",
                )}
              >
                {workspace.status.replace("_", " ")}
              </Badge>
            </div>
            <h1 className="text-3xl font-serif font-bold text-foreground leading-tight">
              {workspace.title}
            </h1>
            {workspace.description && (
              <p className="text-muted-foreground max-w-3xl leading-relaxed">
                {workspace.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-5 pt-1 text-sm text-muted-foreground">
              {workspace.guideName && (
                <span className="flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5" /> Guide: {workspace.guideName}
                </span>
              )}
              {workspace.coGuideName && (
                <span className="flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5" /> Co-Guide: {workspace.coGuideName}
                </span>
              )}
              {workspace.state && (
                <span className="flex items-center gap-1.5">{workspace.state}</span>
              )}
              <span className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Updated{" "}
                {format(new Date(workspace.updatedAt), "MMM d, yyyy")}
              </span>
              {totalWords > 0 && (
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> {totalWords.toLocaleString()} words · ~
                  {estPages} pages
                </span>
              )}
            </div>
            <WorkflowStepper currentState={workflowState} />
          </div>
          <div className="relative z-10 flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCollapsedPersisted(true)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded-md",
                  "text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60",
                )}
                aria-label="Collapse workspace header"
                title="Collapse"
              >
                <Minus className="w-4 h-4" strokeWidth={2.5} />
                <span className="text-[9px] font-medium leading-none tracking-wide uppercase">
                  collapse
                </span>
              </button>
              <WorkspaceCardMenu
                workspaceId={workspace.id}
                workspaceTitle={workspace.title}
                status={workspace.status}
                redirectAfterDelete
                alwaysVisible
              />
              <Button
                variant="outline"
                size="sm"
                onClick={onExport}
                disabled={exporting}
                className="gap-1.5"
              >
                {exporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Export DOCX
              </Button>
              <Link href={`/workspaces/${workspace.id}/editor`}>
                <Button size="sm" className="gap-1.5">
                  <Edit3 className="w-3.5 h-3.5" /> Open Editor
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
