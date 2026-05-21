import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Sparkles,
  Paperclip,
  Send,
  ChevronDown,
  ChevronUp,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  FileType,
  X,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Brain,
  Wrench,
  CheckCircle2,
  Plus,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChartContextFile } from "@/lib/masterChartTypes";

const MAX_CONTEXT_FILES = 3;

const SUGGESTED_PROMPTS = [
  "80 patients: age, sex, group A/B, pre/post outcome scores",
  "Clinical trial: demographics + primary/secondary endpoints",
  "Observational study: exposure, confounders, outcome by follow-up",
  "Add BMI, blood pressure, HbA1c after age column",
  "Remove duplicate columns and standardise units",
  "Generate 30 realistic sample rows from current schema",
  "Convert to multi-sheet: Patient Info | Lab Values | Outcomes",
  "Summarise my methodology and auto-build the master chart",
];

const THINKING_STEPS = [
  "Checking if I can complete this with your current files…",
  "Reading your context files…",
  "Analysing document structure…",
  "Thinking through schema design…",
  "Building Excel columns and rows…",
  "Validating data types…",
  "Finalising master chart…",
];

function fileIcon(filename: string, isVision?: boolean) {
  if (isVision || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(filename))
    return <ImageIcon className="w-3 h-3 shrink-0 text-violet-500" />;
  if (/\.(xlsx?|csv)$/i.test(filename))
    return <FileSpreadsheet className="w-3 h-3 shrink-0 text-emerald-500" />;
  if (/\.pdf$/i.test(filename))
    return <FileType className="w-3 h-3 shrink-0 text-red-500" />;
  return <FileText className="w-3 h-3 shrink-0 text-blue-500" />;
}

function isVisionFile(f: ChartContextFile) {
  return f.extractedText?.startsWith("[VISION_FILE:") ?? false;
}

function ThinkingAnimation({ statusText, thinkingContent }: { statusText?: string; thinkingContent?: string }) {
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    if (thinkingContent?.trim()) return undefined;
    const timer = setInterval(() => setStepIdx((i) => (i + 1) % THINKING_STEPS.length), 2200);
    return () => clearInterval(timer);
  }, [thinkingContent]);

  const displayStatus =
    statusText ??
    (thinkingContent?.trim() ? "Thinking through your dataset…" : THINKING_STEPS[stepIdx]);

  return (
    <div className="mr-auto bg-secondary/60 rounded-2xl px-3.5 py-2.5 max-w-[90%] space-y-1.5 border border-border/40">
      <div className="flex items-center gap-2 text-xs text-primary">
        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        <span className="animate-in fade-in slide-in-from-left-1 duration-300">
          {displayStatus}
        </span>
      </div>
      {thinkingContent?.trim() && (
        <p className="text-[10px] text-muted-foreground italic leading-relaxed whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
          {thinkingContent.slice(-320)}
        </p>
      )}
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </div>
    </div>
  );
}

type ToolPillProps = { tool: string; message: string; ok?: boolean; active?: boolean };
function ToolPill({ tool, message, ok, active }: ToolPillProps) {
  const toolLabel: Record<string, string> = {
    read_sheet_state: "Reading schema",
    read_full_context: "Reading context",
    read_context_bundle: "Loading context",
    apply_sheet_patch: "Patching sheet",
    generate_sample_rows: "Generating rows",
    add_formula_column: "Adding formula col",
    validate_sheet: "Validating",
    commit_version: "Saving version",
    rethink: "Planning",
  };
  const label = toolLabel[tool] ?? tool;
  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border font-medium",
      active
        ? "bg-primary/10 border-primary/30 text-primary animate-pulse"
        : ok === false
          ? "bg-destructive/10 border-destructive/20 text-destructive"
          : "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-400",
    )}>
      {active ? (
        <Wrench className="w-2.5 h-2.5 animate-spin" />
      ) : ok === false ? (
        <X className="w-2.5 h-2.5" />
      ) : (
        <CheckCircle2 className="w-2.5 h-2.5" />
      )}
      {label}{message && !active ? `: ${message.slice(0, 40)}` : ""}
    </div>
  );
}

type MasterChartAiAssistantProps = {
  messages: ChatMessage[];
  busy: boolean;
  statusText?: string;
  thinking?: string;
  toolStatus?: string | null;
  streaming?: boolean;
  contextFiles: ChartContextFile[];
  lastPrompt?: string | null;
  onSend: (text: string) => void;
  onRetry?: () => void;
  onContextUpload: (files: File[]) => Promise<void>;
  /** Fired when user clicks Attach (before the file picker opens). */
  onAttachClick?: () => void;
  onContextDelete?: (fileId: number) => Promise<void>;
  onExpand?: () => void;
  onNewChat?: () => void;
  layoutCollapsed: boolean;
  onLayoutCollapsedChange: (collapsed: boolean) => void;
  className?: string;
};

export function MasterChartAiAssistant({
  messages,
  busy,
  statusText,
  thinking,
  toolStatus,
  streaming,
  contextFiles,
  lastPrompt,
  onSend,
  onRetry,
  onContextUpload,
  onAttachClick,
  onContextDelete,
  onExpand,
  onNewChat,
  layoutCollapsed,
  onLayoutCollapsedChange,
  className,
}: MasterChartAiAssistantProps) {
  const [input, setInput] = useState("");
  const [uploadingContext, setUploadingContext] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const slotsLeft = MAX_CONTEXT_FILES - contextFiles.length;
  const visionCount = contextFiles.filter(isVisionFile).length;
  const textFileCount = contextFiles.length - visionCount;

  const lastErrorMsg = (() => {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && last.content.startsWith("__error__")) {
      return last.content.slice("__error__".length);
    }
    return null;
  })();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, statusText, thinking, streaming, toolStatus]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    onSend(text);
  };

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList).slice(0, slotsLeft);
      if (files.length === 0) return;
      setUploadingContext(true);
      try {
        await onContextUpload(files);
      } finally {
        setUploadingContext(false);
      }
    },
    [onContextUpload, slotsLeft],
  );

  if (layoutCollapsed) {
    return (
      <div className={cn("border rounded-xl bg-card p-3", className)}>
        <Button variant="outline" className="w-full gap-2" onClick={() => onLayoutCollapsedChange(false)}>
          <Sparkles className="w-4 h-4" />
          Open AI Dataset Builder
          <ChevronUp className="w-4 h-4 ml-auto" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col bg-card h-full min-h-[400px] rounded-xl border border-border/60 overflow-hidden", className)}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border/50 bg-card/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {streaming ? (
            <Brain className="w-4 h-4 text-primary animate-pulse shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
          )}
          <span className="font-semibold text-sm truncate">AI Dataset Builder</span>
          {streaming && (
            <Badge className="text-[10px] h-4 px-1.5 bg-primary/15 text-primary border-primary/25 shrink-0">
              Agent active
            </Badge>
          )}
          {!streaming && contextFiles.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">
              {contextFiles.length} file{contextFiles.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {onNewChat && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg hover:bg-primary/10 hover:text-primary"
              onClick={onNewChat}
              title="New chat"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          )}
          {onExpand && (
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onExpand} title="Fullscreen">
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 h-7 text-xs px-2 rounded-lg"
            onClick={() => onLayoutCollapsedChange(true)}
          >
            Collapse
            <ChevronDown className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* ── Messages ── */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-2.5 px-3 py-4 text-sm">
          {messages.length === 0 && !busy && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { step: "1", label: "Upload context", sub: "PDFs, images, DOCX" },
                  { step: "2", label: "Describe chart", sub: "columns, rows, groups" },
                  { step: "3", label: "AI builds it", sub: "download XLSX / CSV" },
                ].map((s) => (
                  <div key={s.step} className="rounded-xl border bg-muted/20 p-2.5 space-y-0.5">
                    <div className="text-xs font-bold text-primary">{s.step}</div>
                    <div className="text-xs font-medium">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground">{s.sub}</div>
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground text-center px-2 text-[11px] leading-relaxed">
                Attach up to <strong>3 files</strong> per batch (PDF, image, DOCX). AI checks feasibility first — if it can build from your files, it proceeds automatically. Build the chart, then add the next batch.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="text-[11px] px-2.5 py-1.5 rounded-full border border-border bg-muted/30 hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors text-left"
                    onClick={() => {
                      setInput(p);
                      textareaRef.current?.focus();
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, idx) => {
            const isError = m.role === "assistant" && m.content.startsWith("__error__");
            const displayContent = isError ? m.content.slice("__error__".length) : m.content;
            const isStreamingAssistant =
              streaming && m.role === "assistant" && idx === messages.length - 1;
            // Hide empty assistant bubbles (placeholders not yet populated)
            if (m.role === "assistant" && !displayContent.trim() && !busy && !streaming) return null;
            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-2xl px-3.5 py-2.5 max-w-[90%] text-xs leading-relaxed",
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground rounded-br-md"
                    : isError
                      ? "mr-auto bg-destructive/8 border border-destructive/20 text-destructive rounded-bl-md"
                      : "mr-auto bg-secondary/70 text-foreground rounded-bl-md border border-border/30",
                )}
              >
                <p className="whitespace-pre-wrap">
                  {displayContent}
                  {isStreamingAssistant && displayContent.trim() && (
                    <span className="inline-block w-0.5 h-3.5 bg-primary ml-0.5 animate-pulse align-text-bottom" />
                  )}
                </p>
                {isError && onRetry && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-6 text-[10px] gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={onRetry}
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    Try again
                  </Button>
                )}
                {m.version != null && m.role === "assistant" && !isError && (
                  <Badge variant="outline" className="mt-2 text-[10px]">v{m.version}</Badge>
                )}
              </div>
            );
          })}

          {streaming && toolStatus && (
            <div className="mr-auto">
              <ToolPill tool="" message={toolStatus} active={true} />
            </div>
          )}
          {streaming && !toolStatus && !messages.some(
            (m, idx) => m.role === "assistant" && idx === messages.length - 1 && m.content.trim(),
          ) && (
            <ThinkingAnimation statusText={statusText ?? "Agent working…"} thinkingContent={thinking} />
          )}
          {busy && !streaming && <ThinkingAnimation statusText={statusText} thinkingContent={thinking} />}
          {!busy && !streaming && lastErrorMsg && lastPrompt && onRetry && messages.length > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
              <RefreshCw className="w-3 h-3 shrink-0" />
              <span>Generation failed. Edit your prompt or try again.</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* ── Input area ── */}
      <div className="shrink-0 p-2.5 pt-2 border-t border-border/40 space-y-1.5">

        {/* File chips — shown only when files are attached */}
        {contextFiles.length > 0 && (
          <div className="flex flex-wrap gap-1 max-h-14 overflow-y-auto px-0.5">
            {contextFiles.map((f) => {
              const vision = isVisionFile(f);
              return (
                <div
                  key={f.id}
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full border max-w-[140px] group",
                    vision
                      ? "bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950/30 dark:border-violet-900/40 dark:text-violet-400"
                      : "bg-muted/50 border-border text-foreground/70",
                  )}
                  title={vision ? `${f.filename} — will be read visually by AI` : f.filename}
                >
                  {vision ? <Eye className="w-2.5 h-2.5 shrink-0" /> : fileIcon(f.filename)}
                  <span className="truncate">{f.filename}</span>
                  {onContextDelete && (
                    <button
                      type="button"
                      className="shrink-0 text-current opacity-50 hover:opacity-100 hover:text-destructive transition-opacity ml-0.5"
                      onClick={() => void onContextDelete(f.id)}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Drag-over overlay hint */}
        {dragOver && (
          <div className="absolute inset-x-2.5 bottom-2.5 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 flex items-center justify-center h-16 pointer-events-none z-10">
            <p className="text-xs text-primary font-medium flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5" /> Drop files to attach
            </p>
          </div>
        )}

        {/* Input container with inline paperclip */}
        <div className={cn(
          "relative rounded-xl border bg-background transition-all duration-150",
          dragOver
            ? "border-primary/50 ring-2 ring-primary/20"
            : "border-border/60 ring-1 ring-transparent focus-within:ring-primary/30 focus-within:border-primary/40",
        )}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe columns, edits, or ask to remove rows/columns…"
            disabled={busy || streaming}
            className="w-full resize-none bg-transparent text-sm px-3 pt-2.5 pb-10 min-h-[72px] max-h-[160px] outline-none placeholder:text-muted-foreground/60 leading-relaxed"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />

          {/* Bottom toolbar inside textarea */}
          <div className="absolute bottom-0 inset-x-0 flex items-center justify-between px-2 py-1.5 border-t border-border/30 bg-muted/20 rounded-b-xl">
            <div className="flex items-center gap-1">
              {/* Hidden file input */}
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp,.gif,.bmp,.xlsx,.xls,.csv,image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={busy || streaming || uploadingContext || slotsLeft <= 0}
                onClick={() => {
                  if (slotsLeft > 0) onAttachClick?.();
                  fileRef.current?.click();
                }}
                className={cn(
                  "flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-colors",
                  slotsLeft <= 0
                    ? "text-muted-foreground/40 cursor-not-allowed"
                    : "text-muted-foreground hover:text-primary hover:bg-primary/10",
                )}
                title={slotsLeft <= 0 ? "Maximum 3 files — remove one to add another" : "Attach files (PDF, image, DOCX, Excel) — max 3 per batch"}
              >
                {uploadingContext ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Paperclip className="w-3.5 h-3.5" />
                )}
                {uploadingContext
                  ? "Processing…"
                  : contextFiles.length > 0
                    ? `${contextFiles.length}/${MAX_CONTEXT_FILES}`
                    : "Attach"}
              </button>
              {visionCount > 0 && (
                <span className="text-[10px] text-violet-600 dark:text-violet-400 flex items-center gap-0.5 ml-0.5">
                  <Eye className="w-2.5 h-2.5" />
                  {visionCount} vision
                </span>
              )}
              {textFileCount > 0 && visionCount === 0 && (
                <span className="text-[10px] text-muted-foreground/60 ml-0.5">
                  {textFileCount} text
                </span>
              )}
            </div>

            {/* Send button */}
            <Button
              size="sm"
              className={cn(
                "h-7 gap-1.5 rounded-lg text-xs font-medium transition-all",
                input.trim() && !busy && !streaming
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 px-3"
                  : "px-2",
              )}
              disabled={busy || streaming || !input.trim()}
              onClick={handleSend}
            >
              {busy || streaming ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {streaming ? "Running…" : busy ? "Building…" : input.trim() ? "Send" : ""}
            </Button>
          </div>
        </div>

        {/* Retry hint */}
        {onRetry && !busy && !streaming && lastErrorMsg && lastPrompt && (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 gap-1.5 text-[11px] border-destructive/20 text-destructive hover:bg-destructive/5"
            onClick={onRetry}
          >
            <RefreshCw className="w-3 h-3" />
            Retry last prompt
          </Button>
        )}
      </div>
    </div>
  );
}
