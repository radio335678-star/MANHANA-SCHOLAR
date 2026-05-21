import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Loader2, Sparkles, X } from "lucide-react";
import { WordFormatRenderer } from "@/components/editor/WordFormatRenderer";
import type { VaultCitationCatalog } from "@workspace/vault-citations";

type AutoCompleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: number;
  workspaceTitle: string;
  catalog?: VaultCitationCatalog;
  onComplete?: () => void;
};

type ValidationResult = {
  ok: boolean;
  warnings: string[];
  errors: string[];
};

export function AutoCompleteDialog({
  open,
  onOpenChange,
  workspaceId,
  workspaceTitle,
  catalog = {},
  onComplete,
}: AutoCompleteDialogProps) {
  const { getToken } = useAuth();
  const abortRef = useRef<AbortController | null>(null);
  const [step, setStep] = useState<"confirm" | "running" | "done">("confirm");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [loadingValidation, setLoadingValidation] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSection, setCurrentSection] = useState("");
  const [streamPreview, setStreamPreview] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("confirm");
      setProgress(0);
      setCurrentSection("");
      setStreamPreview("");
      setStatusMessage("");
      setError(null);
      return;
    }

    setLoadingValidation(true);
    getToken().then(async (token) => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/auto-complete/validate`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setValidation(await res.json());
      } finally {
        setLoadingValidation(false);
      }
    });
  }, [open, workspaceId, getToken]);

  const handleCancel = useCallback(async () => {
    abortRef.current?.abort();
    const token = await getToken();
    await fetch(`/api/workspaces/${workspaceId}/auto-complete/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    onOpenChange(false);
  }, [getToken, workspaceId, onOpenChange]);

  const handleStart = useCallback(async () => {
    setStep("running");
    setError(null);
    setProgress(0);
    abortRef.current = new AbortController();

    try {
      const token = await getToken();
      const res = await fetch(`/api/workspaces/${workspaceId}/auto-complete/stream`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: abortRef.current.signal,
      });

      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let total = 16;
      let done = 0;

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "started") {
              total = data.totalSections ?? 16;
            } else if (data.type === "section_start") {
              setCurrentSection(data.sectionTitle);
              setStatusMessage(`Writing ${data.sectionTitle} (${data.index}/${data.total})…`);
            } else if (data.type === "token") {
              setStreamPreview((prev) => (prev + data.content).slice(-4000));
            } else if (data.type === "section_updated") {
              setStreamPreview(data.content.slice(-4000));
            } else if (data.type === "section_done") {
              done++;
              setProgress(Math.round((done / total) * 100));
            } else if (data.type === "complete") {
              setStep("done");
              setProgress(100);
              setStatusMessage("Thesis auto-complete finished.");
              onComplete?.();
            } else if (data.type === "error") {
              setError(data.message);
              setStep("confirm");
            } else if (data.type === "cancelled") {
              onOpenChange(false);
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setError("Auto-complete failed. Please try again.");
        setStep("confirm");
      }
    }
  }, [getToken, workspaceId, onComplete, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Auto Complete My Entire Thesis
          </DialogTitle>
          <DialogDescription>
            AI will write all sections sequentially using quaasx-computer with research and coherence checks.
          </DialogDescription>
        </DialogHeader>

        {step === "confirm" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 space-y-2">
              <div className="flex items-start gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                Before proceeding, please ensure:
              </div>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li>You have set page targets for all sections (or standard ranges will be used)</li>
                <li>Your pre-thesis file is correct and properly locked</li>
                <li>All Excel/dataset master charts are saved in Research Vault</li>
                <li>All necessary files are uploaded to Research Vault</li>
              </ul>
            </div>

            {loadingValidation ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Validating prerequisites…
              </div>
            ) : validation ? (
              <div className="space-y-2 text-xs">
                {validation.errors.map((e) => (
                  <p key={e} className="text-destructive">{e}</p>
                ))}
                {validation.warnings.map((w) => (
                  <p key={w} className="text-amber-700">{w}</p>
                ))}
              </div>
            ) : null}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {step === "running" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{statusMessage || "Starting…"}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
            {currentSection && streamPreview && (
              <div className="max-h-64 overflow-auto rounded border bg-muted/20 p-2">
                <WordFormatRenderer
                  title={currentSection}
                  htmlContent={streamPreview.replace(/\n\n/g, "</p><p>").replace(/^/, "<p>").replace(/$/, "</p>")}
                  workspaceTitle={workspaceTitle}
                  catalog={catalog}
                  className="shadow-none min-h-0 w-full scale-[0.85] origin-top"
                />
              </div>
            )}
          </div>
        )}

        {step === "done" && (
          <p className="text-sm text-primary font-medium">
            Your thesis sections have been auto-completed. Review each section and export when ready.
          </p>
        )}

        <DialogFooter className="gap-2">
          {step === "confirm" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={handleStart}
                disabled={loadingValidation || (validation != null && !validation.ok)}
                className="gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                Continue
              </Button>
            </>
          )}
          {step === "running" && (
            <Button variant="destructive" onClick={handleCancel} className="gap-1.5">
              <X className="w-4 h-4" />
              Cancel
            </Button>
          )}
          {step === "done" && (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
