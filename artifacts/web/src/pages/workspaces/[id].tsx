import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
  useGetWorkspace,
  useGetWorkspaceProgress,
  useGetVaultSummary,
  useListSections,
  useUpdateWorkspace,
  getGetWorkspaceQueryKey,
  getGetWorkspaceProgressQueryKey,
  getGetVaultSummaryQueryKey,
  getListSectionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { HUMANISER_LEVELS, humaniserBadgeClass, DEFAULT_HUMANISER_LEVEL } from "@workspace/humaniser";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Loader2,
  Database,
  Activity,
  LayoutList,
  CheckCircle2,
  ChevronRight,
  FileText,
  Sparkles,
  FlaskConical,
  Shield,
  Zap,
  Edit3,
  Info,
  Brain,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { PreThesisPanel } from "@/components/workspace/PreThesisPanel";
import { MasterChartPanel } from "@/components/workspace/MasterChartPanel";
import { OpenEditorBanner } from "@/components/workspace/OpenEditorBanner";
import { WorkspaceHeaderCard } from "@/components/workspace/WorkspaceHeaderCard";


const LOCKED_WORKFLOW_STATES = new Set([
  "locked_in",
  "section_build",
  "review",
  "complete",
  "archived",
]);

const HUMANISER_VISITED_KEY = (id: number) => `humaniser-visited-${id}`;

const WORKSPACE_TABS = [
  { id: "overview", label: "Overview", icon: LayoutList },
  { id: "pre-thesis", label: "Pre-Thesis Setup", icon: Shield },
  { id: "dataset", label: "Dataset", icon: FlaskConical },
  { id: "humaniser", label: "AI Humaniser", icon: Brain },
  { id: "vault", label: "Research Vault", icon: Database },
  { id: "activity", label: "Activity", icon: Activity },
] as const;

// ── WorkspaceNextSteps ────────────────────────────────────────────────────────
function WorkspaceNextSteps({
  workspaceId,
  isPreThesisLocked,
  datasetReady,
  humaniserVisited,
  vaultReady,
  onTabChange,
}: {
  workspaceId: number;
  isPreThesisLocked: boolean;
  datasetReady: boolean;
  humaniserVisited: boolean;
  vaultReady: boolean;
  onTabChange: (tab: string) => void;
}) {
  const steps = [
    {
      num: 1,
      label: "Lock-In Pre-Thesis",
      sublabel: "Build with 6 agents, review, then lock in",
      done: isPreThesisLocked,
      tab: "pre-thesis",
      actionLabel: isPreThesisLocked ? "Locked" : "Go",
    },
    {
      num: 2,
      label: "Build your Dataset",
      sublabel: "Create your master data chart",
      done: datasetReady,
      tab: "dataset",
      actionLabel: datasetReady ? "Done" : "Go",
    },
    {
      num: 3,
      label: "Set AI Humaniser",
      sublabel: "Choose your academic writing voice",
      done: humaniserVisited,
      tab: "humaniser",
      actionLabel: humaniserVisited ? "Done" : "Go",
    },
    {
      num: 4,
      label: "Upload to Research Vault",
      sublabel: "Add papers, notes, and references",
      done: vaultReady,
      tab: "vault",
      actionLabel: vaultReady ? "Done" : "Go",
    },
  ];

  const allDone = isPreThesisLocked && datasetReady && humaniserVisited && vaultReady;
  const nextIncomplete = steps.find((s) => !s.done);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
        <h4 className="font-serif font-semibold text-sm text-foreground">Your path to writing</h4>
        {allDone && (
          <Badge variant="outline" className="text-xs border-green-300 text-green-700 bg-green-50">
            All steps complete
          </Badge>
        )}
      </div>
      <div className="divide-y divide-border">
        {steps.map((step) => {
          const isNext = !step.done && nextIncomplete?.num === step.num;
          return (
            <div
              key={step.num}
              className={cn(
                "flex items-center gap-4 px-5 py-3 transition-colors",
                isNext && "bg-primary/[0.03]",
              )}
            >
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border-2",
                  step.done
                    ? "bg-primary/10 border-primary text-primary"
                    : isNext
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-background border-border text-muted-foreground",
                )}
              >
                {step.done ? <CheckCircle2 className="w-4 h-4" /> : step.num}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium",
                    step.done ? "text-foreground" : isNext ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground">{step.sublabel}</p>
              </div>
              {step.done ? (
                <span className="text-xs font-medium text-green-600 flex items-center gap-1 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Done
                </span>
              ) : (
                <Button
                  size="sm"
                  variant={isNext ? "default" : "outline"}
                  className="shrink-0 h-7 px-3 text-xs gap-1"
                  onClick={() => onTabChange(step.tab)}
                >
                  {step.actionLabel} <ChevronRight className="w-3 h-3" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <div className="px-5 py-3.5 border-t border-border bg-muted/30 flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          {allDone
            ? "All steps complete — your workspace is ready for writing."
            : "Complete all 4 steps, then open the editor to start writing."}
        </p>
        <Link href={`/workspaces/${workspaceId}/editor`}>
          <Button
            size="sm"
            className="shrink-0 gap-1.5"
            disabled={!isPreThesisLocked}
            variant={isPreThesisLocked ? "default" : "outline"}
          >
            <Edit3 className="w-3.5 h-3.5" />
            Open Editor
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WorkspaceDetail({ id }: { id: string }) {
  const workspaceId = parseInt(id, 10);
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [humaniserLevel, setHumaniserLevel] = useState(DEFAULT_HUMANISER_LEVEL);
  const [humaniserSaving, setHumaniserSaving] = useState(false);
  const humaniserSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exporting, setExporting] = useState(false);
  const [humaniserVisited, setHumaniserVisited] = useState(false);
  const updateWorkspace = useUpdateWorkspace();
  const [datasetReady, setDatasetReady] = useState(false);

  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialTab = urlParams.get("tab") ?? "overview";
  const preThesisStep = urlParams.get("step");
  const preThesisPreview = urlParams.get("preview") ?? "document";
  const showDatasetGuide = urlParams.get("datasetGuide") === "1";
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHumaniserVisited(localStorage.getItem(HUMANISER_VISITED_KEY(workspaceId)) === "1");
    }
  }, [workspaceId]);

  const fetchDatasetReady = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const token = await getToken();
      const res = await fetch(`/api/workspaces/${workspaceId}/master-charts`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const charts = (await res.json()) as Array<{ currentVersion?: number }>;
      setDatasetReady(charts.length > 0 && charts.some((c) => (c.currentVersion ?? 0) > 0));
    } catch {
      setDatasetReady(false);
    }
  }, [workspaceId, getToken]);

  useEffect(() => {
    void fetchDatasetReady();
  }, [fetchDatasetReady, activeTab]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === "humaniser") {
      setHumaniserVisited(true);
      localStorage.setItem(HUMANISER_VISITED_KEY(workspaceId), "1");
    }
    if (tab === "dataset") {
      void fetchDatasetReady();
    }
    const next = new URL(window.location.href);
    next.searchParams.set("tab", tab);
    window.history.replaceState({}, "", next.pathname + next.search);
  };

  const { data: workspace, isLoading: isWsLoading } = useGetWorkspace(workspaceId, {
    query: { enabled: !!workspaceId, queryKey: getGetWorkspaceQueryKey(workspaceId) },
  });

  // Sync humaniser level from server once workspace loads
  useEffect(() => {
    if (workspace && workspace.humaniserIntensity != null) {
      setHumaniserLevel(workspace.humaniserIntensity);
    }
  }, [workspace?.humaniserIntensity]);

  const handleHumaniserChange = (level: number) => {
    setHumaniserLevel(level);
    setHumaniserVisited(true);
    localStorage.setItem(HUMANISER_VISITED_KEY(workspaceId), "1");
    if (humaniserSaveTimer.current) clearTimeout(humaniserSaveTimer.current);
    humaniserSaveTimer.current = setTimeout(() => {
      setHumaniserSaving(true);
      updateWorkspace.mutate(
        { id: workspaceId, data: { humaniserIntensity: level } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetWorkspaceQueryKey(workspaceId) });
          },
          onError: () => {
            toast({ title: "Could not save Humaniser level", variant: "destructive" });
          },
          onSettled: () => setHumaniserSaving(false),
        },
      );
    }, 600);
  };

  const { data: progress } = useGetWorkspaceProgress(workspaceId, {
    query: { enabled: !!workspaceId, queryKey: getGetWorkspaceProgressQueryKey(workspaceId) },
  });

  const { data: vaultSummary } = useGetVaultSummary(workspaceId, {
    query: { enabled: !!workspaceId, queryKey: getGetVaultSummaryQueryKey(workspaceId) },
  });

  const { data: sections } = useListSections(workspaceId, {
    query: { enabled: !!workspaceId, queryKey: getListSectionsQueryKey(workspaceId) },
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/workspaces/${workspaceId}/export/docx`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${workspace?.title ?? "thesis"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Thesis exported", description: "DOCX downloaded successfully." });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  if (isWsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-muted-foreground">Workspace not found</p>
        <Link href="/workspaces">
          <Button variant="outline">Back to workspaces</Button>
        </Link>
      </div>
    );
  }

  const completionPercent = progress?.percentComplete ?? 0;
  const totalWords = sections?.reduce((acc, s) => acc + (s.wordCount ?? 0), 0) ?? 0;
  const estPages = Math.ceil(totalWords / 250);
  const workflowState = (workspace as { workflowState?: string }).workflowState ?? "init";
  const isPreThesisLocked = LOCKED_WORKFLOW_STATES.has(workflowState);
  const preThesisLabel = isPreThesisLocked ? "Locked" : workflowState.replace("_", " ");
  const vaultReady = (vaultSummary?.total ?? 0) > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-3">

      {/* Open Editor floating banner — shows as soon as pre-thesis is locked */}
      <OpenEditorBanner
        visible={isPreThesisLocked}
        workspaceId={workspace.id}
        signals={{
          preThesisLocked: isPreThesisLocked,
          datasetReady,
          humaniserVisited,
          vaultReady,
        }}
      />

      {/* ── Header (collapsible) ───────────────────────────────────────── */}
      <WorkspaceHeaderCard
        workspace={workspace}
        workflowState={workflowState}
        totalWords={totalWords}
        estPages={estPages}
        exporting={exporting}
        onExport={() => void handleExport()}
      />

      {/* ── Quick Stats ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Completion",
            value: `${completionPercent}%`,
            sub: `${progress?.completedSections ?? 0}/${progress?.totalSections ?? 0} sections`,
            icon: <CheckCircle2 className="w-4 h-4 text-primary" />,
            color: "text-primary",
            accent: "border-l-primary/40",
          },
          {
            label: "Word Count",
            value: totalWords.toLocaleString(),
            sub: `~${estPages} pages`,
            icon: <FileText className="w-4 h-4 text-foreground/60" />,
            color: "text-foreground",
            accent: "border-l-border",
          },
          {
            label: "Vault Resources",
            value: vaultSummary?.total ?? 0,
            sub: `${vaultSummary?.byType?.paper ?? 0} papers`,
            icon: <Database className="w-4 h-4 text-amber-500" />,
            color: "text-amber-600",
            accent: "border-l-amber-400/50",
          },
          {
            label: "Pre-Thesis",
            value: preThesisLabel,
            sub: isPreThesisLocked ? "AI context locked" : "Complete setup & lock-in",
            icon: isPreThesisLocked
              ? <Lock className="w-4 h-4 text-green-500" />
              : <Shield className="w-4 h-4 text-muted-foreground" />,
            color: isPreThesisLocked ? "text-green-600" : "text-muted-foreground",
            accent: isPreThesisLocked ? "border-l-green-500/50" : "border-l-border",
          },
        ].map((stat) => (
          <Card
            key={stat.label}
            className={cn(
              "border-border shadow-sm border-l-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200",
              stat.accent,
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</span>
                {stat.icon}
              </div>
              <div className={cn("text-2xl font-serif font-bold capitalize", stat.color)}>{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        {/* Tab bar — border-b underline style with animated sliding indicator */}
        <TabsList className="w-full justify-start bg-transparent border-b border-border rounded-none h-auto p-0 gap-0">
          {WORKSPACE_TABS.map((tab) => {
            const Icon = tab.icon;
            const tabComplete =
              (tab.id === "pre-thesis" && isPreThesisLocked) ||
              (tab.id === "dataset" && datasetReady) ||
              (tab.id === "humaniser" && humaniserVisited) ||
              (tab.id === "vault" && vaultReady);
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="relative flex items-center gap-1.5 px-4 py-3 text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none font-medium text-muted-foreground hover:text-foreground transition-colors data-[state=active]:text-primary"
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="tabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {tab.label}
                {tabComplete && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Complete" />
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* ── Overview ──────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="space-y-3 p-5 bg-card border border-border rounded-xl shadow-sm">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">Manuscript Progress</span>
                  <span className="font-bold text-primary">{completionPercent}%</span>
                </div>
                <Progress value={completionPercent} className="h-2.5" />
                <div className="grid grid-cols-3 gap-4 pt-2">
                  {[
                    { label: "Not Started", value: progress?.notStartedSections ?? 0, color: "text-muted-foreground", bg: "bg-muted/30" },
                    { label: "In Progress", value: progress?.inProgressSections ?? 0, color: "text-amber-600", bg: "bg-amber-50 border border-amber-100" },
                    { label: "Completed", value: progress?.completedSections ?? 0, color: "text-primary", bg: "bg-primary/5 border border-primary/10" },
                  ].map((s) => (
                    <div key={s.label} className={cn("text-center p-3 rounded-lg", s.bg)}>
                      <div className={cn("text-2xl font-serif font-bold", s.color)}>{s.value}</div>
                      <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-serif font-semibold">Sections</h2>
                  <Link href={`/workspaces/${workspace.id}/editor`}>
                    <Button variant="ghost" size="sm" className="gap-1.5 text-primary text-xs">
                      Open Editor <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
                <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden divide-y divide-border">
                  {sections && sections.length > 0 ? (
                    sections.map((section, i) => (
                      <div
                        key={section.id}
                        className="px-5 py-3.5 flex items-center justify-between hover:bg-secondary/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-muted-foreground/50 w-5">{String(i + 1).padStart(2, "0")}</span>
                          <div
                            className={cn(
                              "w-2 h-2 rounded-full shrink-0",
                              section.status === "completed" ? "bg-primary" :
                              section.status === "in_progress" ? "bg-amber-500" : "bg-muted-foreground/20",
                            )}
                          />
                          <span className="font-medium text-foreground text-sm">{section.title}</span>
                          {section.status === "in_progress" && (
                            <Badge variant="outline" className="text-xs border-amber-200 text-amber-600 bg-amber-50">In Progress</Badge>
                          )}
                          {section.status === "completed" && (
                            <Badge variant="outline" className="text-xs border-primary/20 text-primary bg-primary/5">Complete</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-5 text-sm text-muted-foreground">
                          <span className="w-20 text-right text-xs">{(section.wordCount ?? 0).toLocaleString()} words</span>
                          <Link href={`/workspaces/${workspace.id}/editor?section=${section.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-primary px-2 gap-1">
                              <Edit3 className="w-3 h-3" /> Edit
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-10 text-center space-y-3">
                      <FileText className="w-10 h-10 mx-auto text-muted-foreground/20" />
                      <p className="text-sm text-muted-foreground">No sections yet.</p>
                      <Link href={`/workspaces/${workspace.id}/editor`}>
                        <Button size="sm" variant="outline" className="gap-1.5">
                          <Edit3 className="w-3.5 h-3.5" /> Open Editor to Add Sections
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        {/* ── Pre-Thesis Setup ──────────────────────────────────────────── */}
        <TabsContent value="pre-thesis" className="mt-6">
          <AnimatePresence mode="wait">
            <motion.div
              key="pre-thesis"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-5"
            >
              {/* Info banner */}
              <div className="flex items-start gap-3 p-4 bg-blue-50/80 border border-blue-100 rounded-xl text-sm">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-blue-700">
                  Build your pre-thesis reference with live university guidelines, resolve conflicts, then lock-in.
                  Locked content becomes the single source of truth for all AI writing.
                </div>
              </div>

              {/* Next Steps card — always visible */}
              <WorkspaceNextSteps
                workspaceId={workspace.id}
                isPreThesisLocked={isPreThesisLocked}
                datasetReady={datasetReady}
                humaniserVisited={humaniserVisited}
                vaultReady={vaultReady}
                onTabChange={handleTabChange}
              />

              {/* Pre-Thesis Panel */}
              <PreThesisPanel
                workspaceId={workspaceId}
                initialWizardStep={preThesisStep === "review" ? 3 : undefined}
                initialPreviewTab={preThesisPreview}
                onLocked={() => {
                  queryClient.invalidateQueries({ queryKey: getGetWorkspaceQueryKey(workspaceId) });
                  queryClient.invalidateQueries({ queryKey: getGetVaultSummaryQueryKey(workspaceId) });
                  const next = new URL(window.location.href);
                  next.searchParams.set("datasetGuide", "1");
                  window.history.replaceState({}, "", next.pathname + next.search);
                  handleTabChange("dataset");
                }}
              />
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        {/* ── Dataset ───────────────────────────────────────────────────── */}
        <TabsContent value="dataset" className="mt-6">
          <AnimatePresence mode="wait">
            <motion.div
              key="dataset"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <MasterChartPanel
                workspaceId={workspaceId}
                workspaceDomain={workspace.domain}
                workflowState={workflowState}
                showGuide={showDatasetGuide}
              />
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        {/* ── AI Humaniser ─────────────────────────────────────────────── */}
        <TabsContent value="humaniser" className="mt-6 space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key="humaniser"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="flex items-start gap-3 p-4 bg-amber-50/80 border border-amber-100 rounded-xl text-sm">
                <Sparkles className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-amber-700">
                  The Humaniser shapes how the AI writes your thesis. Higher levels produce more distinctive, natural academic prose.
                  Set this before generating sections — it applies globally to this workspace.
                </div>
              </div>

              <div className="p-6 bg-card border border-border rounded-xl shadow-sm space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-serif font-semibold text-lg">
                        Level {humaniserLevel} — {HUMANISER_LEVELS[humaniserLevel]!.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-0.5">{HUMANISER_LEVELS[humaniserLevel]!.description}</p>
                    </div>
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
                      humaniserBadgeClass(humaniserLevel),
                    )}>
                      {humaniserSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : `L${humaniserLevel}`}
                    </div>
                  </div>
                  <Slider
                    value={[humaniserLevel]}
                    onValueChange={([v]) => handleHumaniserChange(v!)}
                    min={0}
                    max={9}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground overflow-hidden">
                    {HUMANISER_LEVELS.map((l) => (
                      <span key={l.level} className={cn("font-medium truncate text-center", humaniserLevel === l.level && "text-primary")}>
                        {l.shortName}
                      </span>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Example output at this level</p>
                  <div className="p-4 bg-secondary/30 rounded-lg border border-border text-sm italic text-foreground leading-relaxed">
                    "{HUMANISER_LEVELS[humaniserLevel]!.example}"
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {HUMANISER_LEVELS.map((l) => (
                  <button
                    key={l.level}
                    onClick={() => handleHumaniserChange(l.level)}
                    className={cn(
                      "p-3 rounded-xl border-2 text-left transition-all",
                      humaniserLevel === l.level
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-primary/30",
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-mono text-muted-foreground">L{l.level}</span>
                      {humaniserLevel === l.level && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                    </div>
                    <p className="font-serif font-semibold text-xs text-foreground leading-snug">{l.name}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{l.description}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        {/* ── Research Vault ───────────────────────────────────────────── */}
        <TabsContent value="vault" className="mt-6">
          <AnimatePresence mode="wait">
            <motion.div
              key="vault"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="grid sm:grid-cols-3 gap-6">
                {[
                  { label: "Papers", value: vaultSummary?.byType?.paper ?? 0, sub: "Research articles uploaded" },
                  { label: "Notes", value: vaultSummary?.byType?.note ?? 0, sub: "Personal research notes" },
                  { label: "References", value: vaultSummary?.byType?.reference ?? 0, sub: "Citations & bibliographic entries" },
                ].map((item) => (
                  <Card key={item.label} className="border-border shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{item.label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-serif font-bold text-foreground">{item.value}</div>
                      <p className="text-xs text-muted-foreground mt-1">{item.sub}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="p-8 bg-card border border-dashed border-border rounded-xl text-center space-y-4">
                <Database className="w-10 h-10 mx-auto text-muted-foreground/30" />
                <div>
                  <p className="font-serif font-semibold text-lg text-foreground">Research Vault</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Upload PDFs, add notes, save URLs, and import references. The AI draws from your vault when writing every section.
                  </p>
                </div>
                <Link href={`/workspaces/${workspace.id}/vault`}>
                  <Button className="gap-2">
                    <Database className="w-4 h-4" /> Open Research Vault
                  </Button>
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        {/* ── Activity ─────────────────────────────────────────────────── */}
        <TabsContent value="activity" className="mt-6">
          <AnimatePresence mode="wait">
            <motion.div
              key="activity"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <h3 className="font-serif font-semibold">Workspace Information</h3>
              <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden divide-y divide-border">
                {[
                  { label: "Title", value: workspace.title },
                  { label: "Domain", value: workspace.domain },
                  { label: "Qualification", value: workspace.qualification ?? "—" },
                  { label: "Guide", value: workspace.guideName ?? "—" },
                  { label: "Co-Guide", value: workspace.coGuideName ?? "—" },
                  { label: "College", value: workspace.collegeName ?? "—" },
                  { label: "State", value: workspace.state ?? "—" },
                  { label: "Status", value: workspace.status.replace("_", " "), capitalize: true },
                  { label: "Created", value: format(new Date(workspace.createdAt), "MMMM d, yyyy") },
                  { label: "Last Updated", value: format(new Date(workspace.updatedAt), "MMMM d, yyyy h:mm a") },
                  { label: "Total Words", value: totalWords.toLocaleString() },
                  { label: "Estimated Pages", value: `~${estPages}` },
                ].map((row) => (
                  <div key={row.label} className="flex px-5 py-3 text-sm">
                    <span className="w-36 text-muted-foreground font-medium shrink-0">{row.label}</span>
                    <span className={cn("text-foreground", row.capitalize && "capitalize")}>{row.value}</span>
                  </div>
                ))}
              </div>

              {workspace.description && (
                <div className="space-y-2">
                  <h3 className="font-serif font-semibold">Description</h3>
                  <div className="p-5 bg-card border border-border rounded-xl shadow-sm text-sm text-muted-foreground leading-relaxed">
                    {workspace.description}
                  </div>
                </div>
              )}

              <div className="p-4 bg-secondary/20 border border-border rounded-xl flex items-start gap-3 text-sm">
                <Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="text-muted-foreground">
                  Activity timeline and version history will be available in an upcoming update. All section edits are auto-saved.
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </TabsContent>
      </Tabs>
    </div>
  );
}
