import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useVisionReaderStream, type VisionSession } from "@/hooks/useVisionReaderStream";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Eye,
  Upload,
  X,
  Loader2,
  Sparkles,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  FileType,
  Copy,
  CheckCircle2,
  Database,
  ArrowRight,
  Brain,
  History,
  ChevronDown,
  ChevronUp,
  Zap,
  Trash2,
  Send,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

// ── Constants ─────────────────────────────────────────────────────────────────

/** User-facing AI brand (no third-party model names in UI). */
const AI_BRAND = "quaasx-computer";

const MAX_FILES = 10;
const MAX_FILE_SIZE_MB = 25;
/** Matches api-server visionAgent caps for scanned PDF page images */
const MAX_PDF_PAGES_PER_FILE = 10;
const MAX_PDF_VISION_PAGES_TOTAL = 30;

const ALLOWED_EXTS = new Set([
  "pdf", "doc", "docx", "xlsx", "xls", "csv", "ppt", "pptx", "txt",
  "png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "tif",
]);

const READING_STEPS = [
  `Uploading files to ${AI_BRAND}…`,
  "Analysing document structure…",
  "Reading all text and tables…",
  "Identifying data, figures and labels…",
  "Transcribing handwritten or scanned content…",
  "Compiling full detail report…",
];

// ── File helpers ──────────────────────────────────────────────────────────────

function getExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function isAllowed(file: File): boolean {
  return ALLOWED_EXTS.has(getExt(file.name));
}

function FileIcon({ name, className }: { name: string; className?: string }) {
  const ext = getExt(name);
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "tif"].includes(ext))
    return <ImageIcon className={cn("w-4 h-4 text-violet-500", className)} />;
  if (["xlsx", "xls", "csv"].includes(ext))
    return <FileSpreadsheet className={cn("w-4 h-4 text-emerald-500", className)} />;
  if (ext === "pdf")
    return <FileType className={cn("w-4 h-4 text-red-500", className)} />;
  return <FileText className={cn("w-4 h-4 text-blue-500", className)} />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── User guide note ───────────────────────────────────────────────────────────

function VisionReaderUserNote({ workspaceDomain }: { workspaceDomain: string }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl border border-violet-200/70 bg-violet-50/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-violet-100/40 transition-colors"
      >
        <Info className="w-3.5 h-3.5 text-violet-600 shrink-0" />
        <span className="text-xs font-medium text-violet-900 flex-1">How Vision Reader works</span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-violet-500 shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-violet-500 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0 space-y-2.5 text-[11px] leading-relaxed text-violet-900/90 border-t border-violet-200/50">
          <p>
            {AI_BRAND} reads your uploads and writes a <strong>full-detail report</strong> — tables,
            labels, numbers, and handwritten text. No manual copy-paste from PDFs on your side.
          </p>
          <div className="space-y-1">
            <p className="font-medium text-violet-800">Scanned PDFs (photos saved as PDF)</p>
            <p>
              If a PDF is mostly pictures of forms (not selectable text), we turn each page into
              an image and {AI_BRAND} <strong>looks at every page</strong> like a human would — including
              handwriting and tables.
            </p>
            <p className="text-violet-800/80">
              For long scans: up to {MAX_PDF_PAGES_PER_FILE} pages per PDF and{" "}
              {MAX_PDF_VISION_PAGES_TOTAL} vision pages per batch. Split very large files or upload
              key pages as JPG/PNG for best coverage.
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-violet-800">Normal text PDFs &amp; Word/Excel</p>
            <p>
              Digital PDFs and office files are read via the {AI_BRAND} document parser first (faster,
              full document).
            </p>
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-violet-800/85">
            <li>
              Up to {MAX_FILES} files, {MAX_FILE_SIZE_MB} MB each per batch
            </li>
            <li>
              Use <strong>Send to Dataset AI</strong> to build your Excel from the report, or{" "}
              <strong>Save to Vault</strong> for later
            </li>
            <li>Photos (JPG, PNG) go straight to vision — ideal for single scanned sheets</li>
            <li>
              Reports use <strong>{workspaceDomain}</strong> terminology (English + domain-appropriate
              transliterated terms; no Chinese/CJK)
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Thinking animation ────────────────────────────────────────────────────────

function ThinkingAnimation({
  thinkingContent,
  stepText,
}: {
  thinkingContent: string;
  stepText: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-violet-50/80 border border-violet-200/70 rounded-xl px-3.5 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
        <span className="text-xs font-medium text-violet-700 flex-1">{stepText}</span>
        {thinkingContent && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-violet-400 hover:text-violet-600 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      {expanded && thinkingContent && (
        <pre className="text-[10px] text-violet-600/80 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono leading-relaxed">
          {thinkingContent}
        </pre>
      )}
    </div>
  );
}

// ── Formatted output (chat-style, scroll-contained) ───────────────────────────

function VisionFormattedOutput({
  text,
  streaming,
}: {
  text: string;
  streaming?: boolean;
}) {
  const lines = text.split("\n");

  return (
    <div className="space-y-1.5 text-[13px] leading-[1.65] text-foreground/95 break-words">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("## ")) {
          return (
            <h2
              key={i}
              className="text-sm font-semibold text-violet-900 dark:text-violet-200 mt-5 mb-1.5 pb-1 border-b border-violet-200/50 first:mt-0"
            >
              {trimmed.slice(3)}
            </h2>
          );
        }
        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={i} className="text-[13px] font-semibold text-foreground mt-3.5">
              {trimmed.slice(4)}
            </h3>
          );
        }
        if (trimmed.startsWith("#### ")) {
          return (
            <h4 key={i} className="text-xs font-semibold text-muted-foreground mt-2.5 uppercase tracking-wide">
              {trimmed.slice(5)}
            </h4>
          );
        }
        if (/^[-*•]\s+/.test(trimmed)) {
          return (
            <div key={i} className="flex gap-2 pl-1 text-foreground/90">
              <span className="text-violet-500 shrink-0 mt-0.5">•</span>
              <span className="flex-1 min-w-0">{trimmed.replace(/^[-*•]\s+/, "")}</span>
            </div>
          );
        }
        if (trimmed === "---" || trimmed === "***") {
          return <hr key={i} className="border-border/50 my-3" />;
        }
        if (trimmed === "") {
          return <div key={i} className="h-1.5" aria-hidden />;
        }
        const boldMatch = trimmed.match(/^\*\*(.+)\*\*$/);
        if (boldMatch) {
          return (
            <p key={i} className="font-semibold text-foreground">
              {boldMatch[1]}
            </p>
          );
        }
        return (
          <p key={i} className="text-foreground/90">
            {line}
          </p>
        );
      })}
      {streaming && (
        <span
          className="inline-block w-0.5 h-4 bg-violet-500 ml-0.5 animate-pulse align-text-bottom"
          aria-hidden
        />
      )}
    </div>
  );
}

function AssistantOutputBubble({
  text,
  streaming,
  fileCount,
}: {
  text: string;
  streaming?: boolean;
  fileCount?: number;
}) {
  return (
    <div className="flex flex-col gap-2 w-full max-w-full">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-0.5">
        <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-950/50 flex items-center justify-center shrink-0">
          <Sparkles className="w-3 h-3 text-violet-600" />
        </div>
        <span className="font-medium text-foreground/80">{AI_BRAND}</span>
        {fileCount ? (
          <span className="text-muted-foreground/70">· {fileCount} file{fileCount !== 1 ? "s" : ""}</span>
        ) : null}
        {streaming && (
          <Badge className="text-[9px] h-4 px-1.5 bg-violet-500/15 text-violet-700 border-violet-300/40 ml-1">
            Reading…
          </Badge>
        )}
      </div>
      <div className="mr-auto w-full rounded-2xl rounded-tl-md border border-border/50 bg-card shadow-sm px-4 py-3.5 sm:px-5 sm:py-4">
        <VisionFormattedOutput text={text} streaming={streaming} />
      </div>
    </div>
  );
}

// ── History sheet ─────────────────────────────────────────────────────────────

function HistorySheet({
  workspaceId,
  fetchSessions,
  fetchSession,
  onLoad,
  activeSessionId,
}: {
  workspaceId: number;
  fetchSessions: ReturnType<typeof useVisionReaderStream>["fetchSessions"];
  fetchSession: ReturnType<typeof useVisionReaderStream>["fetchSession"];
  onLoad: (session: VisionSession) => void;
  activeSessionId: number | null;
}) {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<VisionSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void fetchSessions(workspaceId, getToken).then((rows) => {
      setSessions(rows);
      setLoading(false);
    });
  }, [open, workspaceId, fetchSessions, getToken]);

  const handleSelect = async (s: VisionSession) => {
    // If the list row already carries full outputText (new API), use it directly.
    // Otherwise fetch the full session to get outputText.
    if (s.outputText) {
      onLoad(s);
      setOpen(false);
      return;
    }
    setLoadingId(s.id);
    const full = await fetchSession(workspaceId, s.id, getToken);
    setLoadingId(null);
    if (full) {
      onLoad(full);
      setOpen(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
          <History className="w-3.5 h-3.5" />
          History
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[360px] sm:w-[420px] flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="text-base">Vision Read History</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-10 px-5">
              No saved sessions yet.
            </div>
          ) : (
            <div className="divide-y">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  disabled={loadingId === s.id}
                  className={cn(
                    "w-full text-left px-5 py-3.5 hover:bg-muted/40 transition-colors space-y-1",
                    activeSessionId === s.id && "bg-violet-50/60",
                  )}
                  onClick={() => void handleSelect(s)}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Eye className="w-3 h-3" />
                    <span>{format(new Date(s.createdAt), "MMM d, yyyy • h:mm a")}</span>
                    {activeSessionId === s.id && (
                      <Badge variant="outline" className="text-[9px] h-3.5 px-1 bg-violet-100 text-violet-700 border-violet-300">
                        Active
                      </Badge>
                    )}
                    {loadingId === s.id ? (
                      <Loader2 className="w-3 h-3 animate-spin ml-auto" />
                    ) : s.tokensUsed ? (
                      <Badge variant="outline" className="text-[9px] h-3.5 px-1 ml-auto">
                        {s.tokensUsed.toLocaleString()} tok
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-foreground/80 flex flex-wrap gap-1">
                    {(s.filesInfo ?? []).slice(0, 4).map((f, i) => (
                      <span key={i} className="flex items-center gap-0.5">
                        <FileIcon name={f.name} className="w-3 h-3" />
                        <span className="max-w-[100px] truncate">{f.name}</span>
                      </span>
                    ))}
                    {(s.filesInfo ?? []).length > 4 && (
                      <span className="text-muted-foreground">+{(s.filesInfo ?? []).length - 4} more</span>
                    )}
                  </div>
                  {s.outputPreview && (
                    <p className="text-[10px] text-muted-foreground/70 leading-relaxed line-clamp-2 mt-0.5">
                      {s.outputPreview}…
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export type VisionReaderSendCallback = (content: string) => void;

export function VisionReaderPanel({
  workspaceId,
  workspaceDomain = "Allopathy",
  onSendToDataset,
}: {
  workspaceId: number;
  workspaceDomain?: string;
  /** Called when user clicks "Send to Dataset AI" — receives the full output text */
  onSendToDataset?: VisionReaderSendCallback;
}) {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    streaming,
    streamContent,
    thinkingContent,
    lastSessionId,
    analyze,
    fetchSession,
    fetchSessions,
    saveToVault,
    reset,
  } = useVisionReaderStream();

  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedToVault, setSavedToVault] = useState(false);
  const [savingVault, setSavingVault] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [autoSyncOn, setAutoSyncOn] = useState(false);
  const [streamingThinking, setStreamingThinking] = useState("");
  // Local session id that survives in-memory resets (differs from hook's lastSessionId which clears on reset())
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  // Track output during streaming (refs avoid stale state in SSE done handler)
  const outputRef = useRef("");
  const thinkingRef = useRef("");

  // localStorage key for fallback session restore across page refreshes
  const lsKey = `vision-last-session-${workspaceId}`;

  // Restore last session on mount / workspace change so output is visible after refresh/login.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      // 1. Prefer DB latest session (most authoritative)
      const sessions = await fetchSessions(workspaceId, getToken);
      if (cancelled) return;
      const latest = sessions[0]; // list is ordered by createdAt DESC
      if (latest?.outputText) {
        setDisplayText(latest.outputText);
        outputRef.current = latest.outputText;
        setActiveSessionId(latest.id);
        try { localStorage.setItem(lsKey, String(latest.id)); } catch { /* ignore */ }
        return;
      }
      // 2. If list row has no outputText (shouldn't happen after server fix, but be safe),
      //    try fetching the full record.
      if (latest) {
        const full = await fetchSession(workspaceId, latest.id, getToken);
        if (cancelled) return;
        if (full?.outputText) {
          setDisplayText(full.outputText);
          outputRef.current = full.outputText;
          setActiveSessionId(full.id);
          try { localStorage.setItem(lsKey, String(full.id)); } catch { /* ignore */ }
          return;
        }
      }
      // 3. localStorage fallback (e.g. DB returned no sessions yet but local remembers an id)
      let storedId: number | null = null;
      try { storedId = Number(localStorage.getItem(lsKey)) || null; } catch { /* ignore */ }
      if (storedId) {
        const stored = await fetchSession(workspaceId, storedId, getToken);
        if (cancelled) return;
        if (stored?.outputText) {
          setDisplayText(stored.outputText);
          outputRef.current = stored.outputText;
          setActiveSessionId(stored.id);
        }
      }
    };
    void restore();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    if (!streaming) return;
    const timer = setInterval(() => setStepIdx((i) => (i + 1) % READING_STEPS.length), 2500);
    return () => clearInterval(timer);
  }, [streaming]);

  // Keep scroll inside the output panel (not the whole page)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (streaming || nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [displayText, streamContent, streaming, streamingThinking]);

  // ── Drag & drop ─────────────────────────────────────────────────────────────

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setFiles((prev) => {
      const combined = [
        ...prev,
        ...arr.filter((f) => {
          if (!isAllowed(f)) return false;
          if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) return false;
          if (prev.some((e) => e.name === f.name && e.size === f.size)) return false;
          return true;
        }),
      ].slice(0, MAX_FILES);
      return combined;
    });
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  // ── Analyze ─────────────────────────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    if (files.length === 0 || streaming) return;
    reset();
    outputRef.current = "";
    thinkingRef.current = "";
    setDisplayText("");
    setStreamingThinking("");
    setSavedToVault(false);

    const prompt = customPrompt.trim() || null;

    await analyze(workspaceId, files, prompt, getToken, async (event) => {
      if (event.type === "token") {
        outputRef.current += event.content;
        setDisplayText(outputRef.current);
      }
      if (event.type === "thinking") {
        thinkingRef.current += event.content;
        setStreamingThinking((prev) => prev + event.content);
      }
      if (event.type === "done") {
        let finalText =
          event.content.trim() ||
          outputRef.current.trim() ||
          thinkingRef.current.trim();

        if (!finalText && event.sessionId) {
          const session = await fetchSession(workspaceId, event.sessionId, getToken);
          finalText = session?.outputText?.trim() ?? "";
        }

        if (finalText) {
          setDisplayText(finalText);
          outputRef.current = finalText;
        } else {
          toast({
            variant: "destructive",
            title: "No output received",
            description:
              "The read finished but returned no text. Try History for a saved session, or run again with fewer files.",
          });
        }

        // Persist active session id so it survives refresh
        if (event.sessionId) {
          setActiveSessionId(event.sessionId);
          try { localStorage.setItem(lsKey, String(event.sessionId)); } catch { /* ignore */ }
        }

        if (autoSyncOn && finalText && onSendToDataset) {
          onSendToDataset(`[Vision Reader Output]\n\n${finalText}`);
        }
      }
      if (event.type === "error") {
        toast({ variant: "destructive", title: "Vision read failed", description: event.message });
      }
    });
  }, [
    files,
    streaming,
    reset,
    customPrompt,
    analyze,
    workspaceId,
    getToken,
    autoSyncOn,
    onSendToDataset,
    toast,
    fetchSession,
  ]);

  // ── Copy ────────────────────────────────────────────────────────────────────

  const handleCopy = useCallback(() => {
    const text = displayText || streamContent;
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [displayText, streamContent]);

  // ── Vault save ───────────────────────────────────────────────────────────────

  const handleSaveVault = useCallback(async () => {
    const sid = activeSessionId ?? lastSessionId;
    if (!sid || savingVault) return;
    setSavingVault(true);
    const result = await saveToVault(workspaceId, sid, undefined, getToken);
    setSavingVault(false);
    if (result.ok) {
      setSavedToVault(true);
      toast({ title: "Saved to Research Vault", description: "Output is now available in your vault." });
    } else {
      toast({ variant: "destructive", title: "Save failed", description: "Could not save to vault." });
    }
  }, [activeSessionId, lastSessionId, savingVault, saveToVault, workspaceId, getToken, toast]);

  // ── Load session from history ────────────────────────────────────────────────

  const handleLoadSession = useCallback((session: VisionSession) => {
    if (session.outputText) {
      setDisplayText(session.outputText);
      outputRef.current = session.outputText;
    }
    setActiveSessionId(session.id);
    try { localStorage.setItem(lsKey, String(session.id)); } catch { /* ignore */ }
    setSavedToVault(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lsKey]);

  // ── Render ───────────────────────────────────────────────────────────────────

  const hasOutput = Boolean(displayText || streamContent || thinkingContent);
  const activeText = displayText || streamContent || thinkingContent;

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[min(72dvh,720px)] min-h-[520px] max-h-[780px] overflow-hidden">
      {/* ── LEFT: Upload zone ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:w-[280px] shrink-0 lg:max-h-full lg:overflow-y-auto lg:overscroll-contain pr-0.5">
        {/* Drop zone */}
        <div
          ref={dropRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !streaming && fileInputRef.current?.click()}
          className={cn(
            "relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200 select-none",
            isDragging
              ? "border-violet-400 bg-violet-50/80 scale-[1.01]"
              : "border-border/60 hover:border-violet-300 hover:bg-muted/30",
            streaming && "pointer-events-none opacity-60",
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,.tif"
            className="sr-only"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
              <Upload className="w-5 h-5 text-violet-600" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Drop files here</p>
              <p className="text-xs text-muted-foreground">
                PDF, DOCX, XLSX, images, scanned forms
              </p>
              <p className="text-[11px] text-muted-foreground/70">
                Up to {MAX_FILES} files · {MAX_FILE_SIZE_MB} MB each
              </p>
            </div>
          </div>
        </div>

        <VisionReaderUserNote workspaceDomain={workspaceDomain} />

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
              <span>{files.length} / {MAX_FILES} files</span>
              <button
                onClick={() => setFiles([])}
                className="hover:text-destructive transition-colors flex items-center gap-1"
                disabled={streaming}
              >
                <Trash2 className="w-3 h-3" /> Clear all
              </button>
            </div>
            <div className="space-y-1 max-h-[200px] overflow-y-auto pr-1">
              {files.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/40 border border-border/40 text-xs group"
                >
                  <FileIcon name={f.name} />
                  <span className="flex-1 min-w-0 truncate text-foreground/80">{f.name}</span>
                  <span className="text-muted-foreground/60 shrink-0">{formatBytes(f.size)}</span>
                  <button
                    onClick={() => !streaming && setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all ml-0.5"
                    disabled={streaming}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Custom prompt toggle */}
        <div className="space-y-1.5">
          <button
            onClick={() => setShowPrompt((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            disabled={streaming}
          >
            {showPrompt ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Custom instructions
          </button>
          {showPrompt && (
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Leave blank for full-detail extraction (default). Or type: 'Extract only patient IDs and group labels'…"
              className="text-xs min-h-[80px] resize-none"
              disabled={streaming}
            />
          )}
        </div>

        {/* Analyse button */}
        <Button
          onClick={() => void handleAnalyze()}
          disabled={files.length === 0 || streaming}
          className="w-full gap-2 shadow-sm"
          size="sm"
        >
          {streaming ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Reading…
            </>
          ) : (
            <>
              <Eye className="w-4 h-4" />
              Read Files with {AI_BRAND}
            </>
          )}
        </Button>

        {/* Auto-sync toggle */}
        <div className="flex items-center justify-between px-0.5">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Zap className="w-3 h-3" />
            Auto-sync to Dataset AI
          </span>
          <button
            onClick={() => setAutoSyncOn((v) => !v)}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none",
              autoSyncOn ? "bg-violet-500" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform",
                autoSyncOn ? "translate-x-4" : "translate-x-0",
              )}
            />
          </button>
        </div>

        {/* History */}
        <div className="flex items-center gap-2 pt-1">
          <HistorySheet
            workspaceId={workspaceId}
            fetchSessions={fetchSessions}
            fetchSession={fetchSession}
            onLoad={handleLoadSession}
            activeSessionId={lastSessionId}
          />
        </div>
      </div>

      {/* ── RIGHT: Chat-style output panel ───────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden rounded-xl border border-border/60 bg-card/40 shadow-sm">
        {/* Panel header */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border/50 bg-card/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            {streaming ? (
              <Loader2 className="w-4 h-4 text-violet-600 animate-spin shrink-0" />
            ) : (
              <Eye className="w-4 h-4 text-violet-600 shrink-0" />
            )}
            <span className="text-sm font-semibold truncate">Vision Reader</span>
            {streaming && (
              <Badge className="text-[10px] h-4 px-1.5 bg-violet-500/15 text-violet-700 border-violet-300/40 shrink-0">
                Live
              </Badge>
            )}
          </div>
          {hasOutput && !streaming && (
            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
              {activeText.length.toLocaleString()} chars
            </span>
          )}
        </div>

        {/* Action bar */}
        {hasOutput && (
          <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border/40 bg-muted/20">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8 text-xs"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />Copied</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" />Copy</>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy full output to clipboard</TooltipContent>
            </Tooltip>

            {(activeSessionId ?? lastSessionId) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    onClick={() => void handleSaveVault()}
                    disabled={savingVault || savedToVault}
                  >
                    {savingVault ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : savedToVault ? (
                      <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />Saved</>
                    ) : (
                      <><Database className="w-3.5 h-3.5" />Save to Vault</>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save output to Research Vault</TooltipContent>
              </Tooltip>
            )}

            {onSendToDataset && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="gap-1.5 h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
                    onClick={() =>
                      onSendToDataset(`[Vision Reader Output]\n\n${activeText}`)
                    }
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send to Dataset AI
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Push output directly into the Dataset AI Assistant</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* Scrollable messages — stays inside panel; extra bottom padding clears workspace footer */}
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain scroll-smooth"
        >
          <div className="px-4 py-4 pb-24 space-y-4 min-h-full">
            {streaming && !hasOutput && (
              <ThinkingAnimation
                thinkingContent={streamingThinking}
                stepText={READING_STEPS[stepIdx] ?? READING_STEPS[0]}
              />
            )}

            {streaming && hasOutput && (
              <div className="sticky top-0 z-10 -mx-1 px-1 pb-2 bg-gradient-to-b from-card/95 via-card/90 to-transparent">
                <ThinkingAnimation
                  thinkingContent={streamingThinking}
                  stepText={READING_STEPS[stepIdx] ?? READING_STEPS[0]}
                />
              </div>
            )}

            {hasOutput ? (
              <AssistantOutputBubble
                text={activeText}
                streaming={streaming}
                fileCount={files.length}
              />
            ) : !streaming ? (
              <div className="flex flex-col items-center justify-center min-h-[280px] text-center space-y-4 select-none py-8">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-100 to-violet-50 flex items-center justify-center border border-violet-200/60">
                  <Eye className="w-7 h-7 text-violet-500" />
                </div>
                <div className="space-y-1.5 max-w-sm">
                  <p className="text-sm font-medium text-foreground">
                    {AI_BRAND} Vision Reader
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Upload files on the left, then click Read Files with {AI_BRAND}. Your report
                    appears here in a scrollable chat view.
                  </p>
                  <p className="text-[10px] text-muted-foreground/80">
                    Output follows your thesis domain ({workspaceDomain}) — English with
                    domain-appropriate terms.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5 max-w-xs">
                  {["PDF reports", "Scanned forms", "Excel tables", "Lab images", "Charts"].map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px] h-5">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer status */}
        {!streaming && (activeSessionId ?? lastSessionId) && (
          <div className="shrink-0 flex items-center gap-2 text-[10px] text-muted-foreground px-4 py-2 border-t border-border/40 bg-muted/10">
            <Brain className="w-3 h-3" />
            <span>Session #{activeSessionId ?? lastSessionId}</span>
            <span className="text-border">·</span>
            <Sparkles className="w-3 h-3" />
            <span>{AI_BRAND} read complete</span>
          </div>
        )}
      </div>
    </div>
  );
}
