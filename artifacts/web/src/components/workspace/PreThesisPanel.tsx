import { useCallback, useEffect, useRef, useState } from "react";
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
      toast({ title: "Export failed", variant: "destructive" });
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
    toast({
      title: "Document updated",
      description: payload.summary,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 items-center">
        {WIZARD_STEPS.map((step, i) => (
          <Badge
            key={step}
            variant={wizardStep === i ? "default" : "outline"}
            className={cn("cursor-pointer", wizardStep > i && "border-green-500 text-green-700")}
            onClick={() => !building && setWizardStep(i)}
          >
            {wizardStep > i ? <CheckCircle2 className="w-3 h-3 mr-1" /> : null}
            {i + 1}. {step}
          </Badge>
        ))}
        {data?.buildVersion === 2 && (
          <Badge variant="secondary" className="ml-auto">
            Build v2
            {data.completenessScore != null ? ` · ${data.completenessScore}% complete` : ""}
          </Badge>
        )}
      </div>

      {wizardStep === 0 && (
        <div className="space-y-4 p-4 border rounded-xl bg-card">
          <h3 className="font-serif font-semibold">Step 1 — Scholar & study context</h3>
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

      {wizardStep === 1 && (
        <div className="space-y-4 p-4 border rounded-xl bg-card">
          <h3 className="font-serif font-semibold">Step 2 — Upload synopsis (recommended)</h3>
          <p className="text-sm text-muted-foreground">
            Upload your approved synopsis (DOCX/TXT) for study-specific chapter blueprints like the
            example PRE-REFERENCE file.
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
            <p className="text-sm text-green-700 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Synopsis on file
            </p>
          )}
          <Button onClick={() => setWizardStep(2)}>Continue to Build</Button>
        </div>
      )}

      {wizardStep >= 2 && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleBuild} disabled={building || isLocked} className="gap-2">
              {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              Build Pre-Thesis (6 agents)
            </Button>
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
                className="gap-2"
              >
                {locking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}{" "}
                Lock-In
              </Button>
            ) : (
              <Button variant="outline" onClick={handleUnlock} className="gap-2">
                <Unlock className="w-4 h-4" /> Unlock
              </Button>
            )}
          </div>

          {isLocked && data?.preThesisMdHash && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0" />
              Locked — SHA-256: <code className="text-xs">{data.preThesisMdHash.slice(0, 16)}…</code>
            </div>
          )}

          {data?.warnings?.map((w, i) => (
            <div
              key={i}
              className="p-2 border border-amber-200 bg-amber-50 rounded text-sm text-amber-900"
            >
              {w}
            </div>
          ))}

          {building && telemetry.length > 0 && (
            <div className="p-4 border rounded-lg bg-card space-y-1 max-h-48 overflow-y-auto font-mono text-xs">
              {telemetry.map((t, i) => (
                <p key={i} className="text-muted-foreground">
                  [{t.agent ?? t.type}] {t.message}
                </p>
              ))}
            </div>
          )}

          {wizardStep >= 3 && (
            <div className="space-y-4">
              {data?.conflicts
                ?.filter((c) => !c.resolved)
                .map((c) => (
                  <div
                    key={c.id}
                    className="p-3 border border-amber-200 bg-amber-50 rounded-lg text-sm"
                  >
                    <div className="flex gap-2 items-start">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                      <div className="flex-1">
                        <strong>{c.fieldKey}</strong>: template {c.templateValue} vs live{" "}
                        {c.liveValue}
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

              {data && (
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
              )}
            </div>
          )}
        </>
      )}

      <div className="grid md:grid-cols-2 gap-4">
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
                "flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all",
                checked ? "border-primary bg-primary/5" : "border-border",
                isLocked && "opacity-60 cursor-not-allowed",
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

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Checklist</span>
          <span>{pct}%</span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

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
    </div>
  );
}
