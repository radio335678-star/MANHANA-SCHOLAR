import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Shield,
  Lock,
  Unlock,
  RefreshCw,
  AlertTriangle,
  Upload,
  Download,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { checklistProgress, PRE_THESIS_CHECKLIST_ITEMS } from "@/lib/preThesisChecklist";
import { usePreThesisBuildStream } from "@/hooks/usePreThesisBuildStream";
import { PreThesisPreviewLayout } from "@/components/workspace/pre-thesis/PreThesisPreviewLayout";
import { LockInGuide } from "@/components/workspace/pre-thesis/LockInGuide";
import { celebrateLockIn } from "@/lib/celebrateLockIn";

type PreThesisData = {
  workflowState: string;
  isLocked: boolean;
  buildVersion: number;
  preThesisDraftMd: string | null;
  preThesisLockedMd: string | null;
  preThesisMdHash: string | null;
  preThesisChecklist: Record<string, boolean>;
  researchNotes: string | null;
  hasSynopsis: boolean;
  departmentId: number | null;
  candidateName: string | null;
  hodName: string | null;
  studyType: string | null;
  completenessScore: number | null;
  warnings: string[];
  resultJson: Record<string, unknown> | null;
  conflicts: Array<{
    id: number;
    fieldKey: string;
    templateValue: string | null;
    liveValue: string | null;
    severity: string;
    resolved: boolean;
  }>;
  sources: Array<{ id: number; title: string; url: string | null; attribution: string }>;
};

const WIZARD_STEPS = ["Setup", "Synopsis", "Build", "Review", "Lock"] as const;

export function PreThesisPanel({
  workspaceId,
  onLocked,
  initialWizardStep,
  initialPreviewTab = "document",
}: {
  workspaceId: number;
  onLocked?: () => void;
  initialWizardStep?: number;
  initialPreviewTab?: string;
}) {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<PreThesisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [locking, setLocking] = useState(false);
  const [draftMd, setDraftMd] = useState("");
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [candidateName, setCandidateName] = useState("");
  const [hodName, setHodName] = useState("");
  const [studyType, setStudyType] = useState("");
  const [wizardStep, setWizardStep] = useState(initialWizardStep ?? 0);
  const [previewTab, setPreviewTab] = useState(initialPreviewTab);
  const [scrollAnchor, setScrollAnchor] = useState<string | null>(null);
  const [aiStreaming, setAiStreaming] = useState(false);
  const {
    telemetry,
    building,
    streamBuild,
    setBuilding,
    reset: resetBuildStream,
  } = usePreThesisBuildStream();

  const fetchPreThesis = useCallback(async () => {
    const token = await getToken();
    const res = await fetch(`/api/workspaces/${workspaceId}/pre-thesis`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load pre-thesis");
    const json = await res.json();
    setData(json);
    setDraftMd(json.preThesisDraftMd ?? json.preThesisLockedMd ?? "");
    setNotes(json.researchNotes ?? "");
    setChecklist(json.preThesisChecklist ?? {});
    setCandidateName(json.candidateName ?? "");
    setHodName(json.hodName ?? "");
    setStudyType(json.studyType ?? "");
    return json as PreThesisData;
  }, [workspaceId, getToken]);

  useEffect(() => {
    fetchPreThesis()
      .catch(() => toast({ title: "Failed to load pre-thesis", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [fetchPreThesis, toast]);

  const savePatch = async (patch: Record<string, unknown>) => {
    const token = await getToken();
    await fetch(`/api/workspaces/${workspaceId}/pre-thesis`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    });
  };

  const handleStreamComplete = async (jobId: number) => {
    const outcome = await streamBuild(workspaceId, jobId, getToken);
    const refreshed = await fetchPreThesis();
    if (outcome === "complete") {
      setWizardStep(3);
      setPreviewTab("document");
      setChecklist((prev) => ({
        ...prev,
        university: true,
        synopsis: prev.synopsis || Boolean(refreshed?.hasSynopsis),
      }));
    }
    setBuilding(false);
  };

  const handleBuild = async () => {
    setBuilding(true);
    setWizardStep(2);
    try {
      await savePatch({ candidateName, hodName, studyType, researchNotes: notes, preThesisChecklist: checklist });
      const token = await getToken();
      const res = await fetch(`/api/workspaces/${workspaceId}/pre-thesis/build`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Build failed to start");
      const { jobId } = await res.json();
      await handleStreamComplete(jobId);
    } catch {
      toast({ title: "Build failed", variant: "destructive" });
      setBuilding(false);
    }
  };

  const handleSynopsisUpload = async (file: File) => {
    setUploading(true);
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/workspaces/${workspaceId}/pre-thesis/synopsis`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error("Upload failed");
      const json = await res.json();
      toast({ title: "Synopsis uploaded", description: `${json.charCount} characters extracted` });
      await fetchPreThesis();
      setWizardStep(2);
    } catch {
      toast({ title: "Synopsis upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const resolveConflict = async (conflictId: number, appliedValue: string) => {
    const token = await getToken();
    await fetch(
      `/api/workspaces/${workspaceId}/pre-thesis/conflicts/${conflictId}/resolve`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ appliedValue }),
      },
    );
    await fetchPreThesis();
  };

  const handleLock = async () => {
    if (locking || isLocked) return;
    setLocking(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/workspaces/${workspaceId}/pre-thesis/lock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Lock failed");
      }

      await fetchPreThesis();
      setWizardStep(4);

      if (body.alreadyLocked) {
        toast({
          title: "Pre-thesis already locked",
          description: "Your setup is locked and ready for the Dataset step.",
        });
      } else {
        void celebrateLockIn();
        toast({
          title: "Pre-thesis locked",
          description: body.vaultUploadPending
            ? "AI context frozen. DOCX vault upload will retry automatically."
            : "AI context is frozen. Locked DOCX saved to Research Vault.",
        });
      }

      onLocked?.();
    } catch (e) {
      toast({
        title: "Lock failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLocking(false);
    }
  };

  const handleUnlock = async () => {
    if (!confirm("Unlocking voids the live-verification stamp. Continue?")) return;
    try {
      const token = await getToken();
      await fetch(`/api/workspaces/${workspaceId}/pre-thesis/unlock`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: true }),
      });
      await fetchPreThesis();
    } catch {
      toast({ title: "Unlock failed", variant: "destructive" });
    }
  };

  const downloadDocx = async () => {
    const token = await getToken();
    const res = await fetch(`/api/workspaces/${workspaceId}/pre-thesis/export.docx`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      let detail = "Export failed";
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) detail = body.error;
      } catch {
        /* ignore */
      }
      toast({ title: detail, variant: "destructive" });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pre-thesis-${workspaceId}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDocumentUpdated = (payload: {
    resultJson: Record<string, unknown>;
    preThesisDraftMd: string;
    completenessScore: number;
    summary: string;
  }) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            resultJson: payload.resultJson,
            completenessScore: payload.completenessScore,
          }
        : prev,
    );
    setDraftMd(payload.preThesisDraftMd);
    toast({ title: "Document updated", description: payload.summary });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isLocked = data?.isLocked ?? false;
  const { requiredDone, pct } = checklistProgress(checklist);
  const unresolvedCritical =
    data?.conflicts?.filter((c) => !c.resolved && c.severity === "critical") ?? [];
  const buildComplete = (data?.buildVersion ?? 0) >= 2 && Boolean(draftMd.trim());
  const buildBlurred = wizardStep >= 3 && buildComplete && !building;
  const showLockGuide = wizardStep >= 3 && !isLocked && buildComplete;

  return (
    <div className="space-y-5">

      {/* ── Wizard Stepper ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center">
          {WIZARD_STEPS.map((step, i) => {
            const done = wizardStep > i;
            const current = wizardStep === i;
            return (
              <div key={step} className="flex items-center flex-1 last:flex-none">
                {/* Step node */}
                <button
                  type="button"
                  disabled={building}
                  onClick={() => !building && setWizardStep(i)}
                  className="flex flex-col items-center gap-1 group focus:outline-none"
                >
                  <div
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                      done && "bg-primary/10 border-primary text-primary",
                      current && "bg-primary border-primary text-primary-foreground shadow-md ring-4 ring-primary/20",
                      !done && !current && "bg-background border-border text-muted-foreground",
                    )}
                  >
                    {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-medium leading-none whitespace-nowrap",
                      current ? "text-primary" : done ? "text-primary/70" : "text-muted-foreground",
                    )}
                  >
                    {step}
                  </span>
                </button>
                {/* Connector line (not after last step) */}
                {i < WIZARD_STEPS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-px mx-1 mb-4 rounded-full transition-colors",
                      done ? "bg-primary/50" : "bg-border",
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
        {/* Build version badge on its own line */}
        {data?.buildVersion === 2 && (
          <div className="flex justify-end">
            <Badge variant="secondary" className="text-xs">
              Build v2{data.completenessScore != null ? ` · ${data.completenessScore}% complete` : ""}
            </Badge>
          </div>
        )}
      </div>

      {/* ── Step 0: Setup ──────────────────────────────────────────── */}
      {wizardStep === 0 && (
        <div className="space-y-4 p-5 border border-border rounded-xl bg-card">
          <h3 className="font-serif font-semibold text-base">Step 1 — Scholar & study context</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Candidate name</Label>
              <Input
                value={candidateName}
                disabled={isLocked}
                onChange={(e) => setCandidateName(e.target.value)}
                onBlur={() => void savePatch({ candidateName })}
              />
            </div>
            <div className="space-y-2">
              <Label>HOD name</Label>
              <Input
                value={hodName}
                disabled={isLocked}
                onChange={(e) => setHodName(e.target.value)}
                onBlur={() => void savePatch({ hodName })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Study type</Label>
              <Input
                placeholder="e.g. Analytical cross-sectional study"
                value={studyType}
                disabled={isLocked}
                onChange={(e) => setStudyType(e.target.value)}
                onBlur={() => void savePatch({ studyType })}
              />
            </div>
          </div>
          <Button onClick={() => setWizardStep(1)} disabled={isLocked}>
            Continue to Synopsis
          </Button>
        </div>
      )}

      {/* ── Step 1: Synopsis ───────────────────────────────────────── */}
      {wizardStep === 1 && (
        <div className="space-y-4 p-5 border border-border rounded-xl bg-card">
          <h3 className="font-serif font-semibold text-base">Step 2 — Upload synopsis (recommended)</h3>
          <p className="text-sm text-muted-foreground">
            Upload your approved synopsis (DOCX/TXT) for study-specific chapter blueprints.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".docx,.txt,.md,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleSynopsisUpload(f);
            }}
          />
          <div className="flex flex-wrap gap-3 items-center">
            <Button
              variant="outline"
              disabled={isLocked || uploading}
              onClick={() => fileRef.current?.click()}
              className="gap-2"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload synopsis
            </Button>
            {data?.hasSynopsis && (
              <span className="text-sm text-green-700 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Synopsis on file
              </span>
            )}
          </div>
          <Button onClick={() => setWizardStep(2)}>Continue to Build</Button>
        </div>
      )}

      {/* ── Steps 2+: Build, Review, Lock ──────────────────────────── */}
      {wizardStep >= 2 && (
        <>
          {/* ── Checklist card (shown before buttons so user fills first) ── */}
          {!isLocked && (
            <div className="border border-border rounded-xl bg-card overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
                <h4 className="font-serif font-semibold text-sm">Pre-Thesis Checklist</h4>
                <span className="text-xs text-muted-foreground font-medium">{pct}% complete</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid sm:grid-cols-2 gap-2">
                  {PRE_THESIS_CHECKLIST_ITEMS.map((item) => {
                    const checked = checklist[item.id] ?? false;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={isLocked}
                        onClick={() => {
                          const next = { ...checklist, [item.id]: !checked };
                          setChecklist(next);
                          void savePatch({ preThesisChecklist: next });
                        }}
                        className={cn(
                          "flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all",
                          checked
                            ? "border-primary/40 bg-primary/5"
                            : "border-border bg-background hover:border-primary/30",
                          isLocked && "opacity-60 cursor-not-allowed",
                        )}
                      >
                        <div
                          className={cn(
                            "w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center",
                            checked ? "bg-primary border-primary" : "border-border",
                          )}
                        >
                          {checked && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium leading-tight">{item.label}</span>
                          {item.required && (
                            <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Required
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <Progress value={pct} className="h-1.5" />
              </div>
            </div>
          )}

          {/* Locked checklist summary */}
          {isLocked && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-green-200 bg-green-50 text-sm text-green-800">
              <Lock className="w-4 h-4 shrink-0" />
              <span>
                Pre-thesis locked — checklist frozen.
                {data?.preThesisMdHash && (
                  <> SHA-256: <code className="text-xs">{data.preThesisMdHash.slice(0, 16)}…</code></>
                )}
              </span>
            </div>
          )}

          {/* ── Action buttons ──────────────────────────────────────── */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Build button — dimmed when build already done */}
            <Button
              onClick={handleBuild}
              disabled={building || isLocked || buildBlurred}
              className={cn("gap-2 transition-opacity", buildBlurred && "opacity-30 cursor-not-allowed")}
            >
              {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              Build Pre-Thesis (8 agents)
            </Button>

            {/* "Build complete" indicator replaces the blurred button's meaning */}
            {buildBlurred && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                Build complete
              </span>
            )}

            <Button
              variant="outline"
              onClick={async () => {
                setBuilding(true);
                resetBuildStream();
                try {
                  const token = await getToken();
                  const res = await fetch(`/api/workspaces/${workspaceId}/pre-thesis/revalidate`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  if (!res.ok) throw new Error("Revalidate failed");
                  const { jobId } = await res.json();
                  await handleStreamComplete(jobId);
                } catch {
                  toast({ title: "Revalidate failed", variant: "destructive" });
                  setBuilding(false);
                }
              }}
              disabled={building || isLocked}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Re-Check Live
            </Button>

            <Button variant="outline" onClick={downloadDocx} className="gap-2">
              <Download className="w-4 h-4" /> Download DOCX
            </Button>

            {!isLocked ? (
              <Button
                variant="default"
                onClick={handleLock}
                disabled={
                  locking ||
                  aiStreaming ||
                  !draftMd.trim() ||
                  !requiredDone ||
                  unresolvedCritical.length > 0 ||
                  (data?.buildVersion ?? 1) < 2
                }
                title={
                  aiStreaming
                    ? "Wait for the AI assistant to finish"
                    : "Preview reflects your latest AI-approved structure"
                }
                className={cn(
                  "gap-2",
                  showLockGuide && "ring-2 ring-primary/40",
                )}
              >
                {locking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Lock-In
              </Button>
            ) : (
              <Button variant="outline" onClick={handleUnlock} className="gap-2">
                <Unlock className="w-4 h-4" /> Unlock
              </Button>
            )}
          </div>

          {/* ── Warnings ────────────────────────────────────────────── */}
          {data?.warnings?.map((w, i) => (
            <div
              key={i}
              className="p-3 border border-amber-200 bg-amber-50 rounded-lg text-sm text-amber-900"
            >
              {w}
            </div>
          ))}

          {/* ── Build telemetry log ─────────────────────────────────── */}
          {building && telemetry.length > 0 && (
            <div className="p-4 border rounded-lg bg-card space-y-1 max-h-48 overflow-y-auto font-mono text-xs">
              {telemetry.map((t, i) => (
                <p key={i} className="text-muted-foreground">
                  [{t.agent ?? t.type}] {t.message}
                </p>
              ))}
            </div>
          )}

          {/* ── Review step content ─────────────────────────────────── */}
          {wizardStep >= 3 && (
            <div className="space-y-4">
              {/* Conflict resolution */}
              {unresolvedCritical.length > 0 && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
                  Resolve critical conflicts below before locking in.
                </p>
              )}
              {data?.conflicts
                ?.filter((c) => !c.resolved)
                .map((c) => (
                  <div key={c.id} className="p-3 border border-amber-200 bg-amber-50 rounded-lg text-sm">
                    <div className="flex gap-2 items-start">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                      <div className="flex-1">
                        <strong>{c.fieldKey}</strong>: template "{c.templateValue}" vs live "{c.liveValue}"
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isLocked}
                            onClick={() => void resolveConflict(c.id, c.templateValue ?? "")}
                          >
                            Use template
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isLocked}
                            onClick={() => void resolveConflict(c.id, c.liveValue ?? "")}
                          >
                            Use live
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

              {/* Lock-In callout — inline, above the preview */}
              <LockInGuide workspaceId={workspaceId} visible={showLockGuide} />

              {/* Document preview — full width */}
              {data && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="rounded-2xl border border-border bg-card shadow-md overflow-hidden"
                >
                  <PreThesisPreviewLayout
                    workspaceId={workspaceId}
                    data={{
                      resultJson: data.resultJson,
                      sources: data.sources,
                      warnings: data.warnings,
                      completenessScore: data.completenessScore,
                    }}
                    previewTab={previewTab}
                    onPreviewTabChange={setPreviewTab}
                    scrollAnchor={scrollAnchor}
                    onScrollAnchorChange={setScrollAnchor}
                    disabled={isLocked}
                    onDocumentUpdated={handleDocumentUpdated}
                    onStreamingChange={setAiStreaming}
                  />
                </motion.div>
              )}
            </div>
          )}

          {/* ── Research notes ──────────────────────────────────────── */}
          <div className="space-y-2">
            <Label>Research notes (locked context for AI)</Label>
            <Textarea
              value={notes}
              disabled={isLocked}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => void savePatch({ researchNotes: notes })}
              rows={4}
              className="text-sm"
            />
          </div>
        </>
      )}
    </div>
  );
}
