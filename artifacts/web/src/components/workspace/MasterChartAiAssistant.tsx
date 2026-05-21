import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChartContextFile } from "@/lib/masterChartTypes";

const MAX_CONTEXT_FILES = 20;

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
  "Reading your context files…",
  "Analysing document structure…",
  "Thinking through schema design…",
  "Building Excel columns and rows…",
  "Validating data types…",
  "Finalising master chart…",
];

function fileIcon(filename: string) {
  if (/\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(filename))
    return <ImageIcon className="w-3 h-3 shrink-0 text-violet-500" />;
  if (/\.(xlsx?|csv)$/i.test(filename))
    return <FileSpreadsheet className="w-3 h-3 shrink-0 text-emerald-500" />;
  if (/\.pdf$/i.test(filename))
    return <FileType className="w-3 h-3 shrink-0 text-red-500" />;
  return <FileText className="w-3 h-3 shrink-0 text-blue-500" />;
}

function ThinkingAnimation({ statusText, thinkingContent }: { statusText?: string; thinkingContent?: string }) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIdx((i) => (i + 1) % THINKING_STEPS.length);
    }, 2200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mr-auto bg-secondary rounded-lg px-3 py-2.5 max-w-[95%] space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-primary">
        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        <span className="animate-in fade-in slide-in-from-left-1 duration-300">
          {statusText ?? THINKING_STEPS[stepIdx]}
        </span>
      </div>
      {thinkingContent && (
        <p className="text-[10px] text-muted-foreground italic leading-relaxed line-clamp-2">
          {thinkingContent.slice(0, 160)}…
        </p>
      )}
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce"
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
    read_context_bundle: "Loading context",
    apply_sheet_patch: "Patching sheet",
    validate_sheet: "Validating",
    commit_version: "Saving version",
    rethink: "Planning",
  };
  const label = toolLabel[tool] ?? tool;
  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border font-medium",
      active ? "bg-primary/10 border-primary/30 text-primary animate-pulse" :
      ok === false ? "bg-destructive/10 border-destructive/20 text-destructive" :
      "bg-green-50 border-green-200 text-green-700",
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
  onContextDelete?: (fileId: number) => Promise<void>;
  onExpand?: () => void;
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
  onContextDelete,
  onExpand,
  layoutCollapsed,
  onLayoutCollapsedChange,
  className,
}: MasterChartAiAssistantProps) {
  const [input, setInput] = useState("");
  const [contextOpen, setContextOpen] = useState(true);
  const [uploadingContext, setUploadingContext] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const slotsLeft = MAX_CONTEXT_FILES - contextFiles.length;

  const lastErrorMsg = (() => {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && last.content.startsWith("__error__")) {
      return last.content.slice("__error__".length);
    }
    return null;
  })();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, statusText]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
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
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => onLayoutCollapsedChange(false)}
        >
          <Sparkles className="w-4 h-4" />
          Open AI Dataset Builder
          <ChevronUp className="w-4 h-4 ml-auto" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col border rounded-xl bg-card h-full min-h-[400px]", className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          {streaming ? (
            <Brain className="w-4 h-4 text-primary animate-pulse" />
          ) : (
            <Sparkles className="w-4 h-4 text-primary" />
          )}
          <span className="font-medium text-sm">AI Dataset Builder</span>
          {streaming && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary border-primary/20">
              Agent active
            </Badge>
          )}
          {!streaming && contextFiles.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              {contextFiles.length} file{contextFiles.length > 1 ? "s" : ""} in context
            </Badge>
          )}
        </div>
        <div className="flex gap-1">
          {onExpand && (
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onExpand} title="Fullscreen">
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 h-8"
            onClick={() => onLayoutCollapsedChange(true)}
          >
            Collapse
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4">
        <div className="space-y-3 py-4 text-sm min-h-[120px]">
          {messages.length === 0 && !busy && (
            <div className="space-y-4">
              {/* Step guide */}
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { step: "1", label: "Upload context", sub: "PDFs, images, DOCX" },
                  { step: "2", label: "Describe chart", sub: "columns, rows, groups" },
                  { step: "3", label: "AI builds it", sub: "download XLSX / CSV" },
                ].map((s) => (
                  <div key={s.step} className="rounded-lg border bg-muted/30 p-2 space-y-0.5">
                    <div className="text-xs font-semibold text-primary">{s.step}</div>
                    <div className="text-xs font-medium">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground">{s.sub}</div>
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground text-center px-2 text-xs leading-relaxed">
                AI reads every uploaded file before building. Each message creates a new versioned chart.
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="text-xs px-2.5 py-1.5 rounded-full border border-border bg-muted/40 hover:bg-primary/10 hover:border-primary/30 transition-colors text-left"
                    onClick={() => setInput(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => {
            const isError = m.role === "assistant" && m.content.startsWith("__error__");
            const displayContent = isError ? m.content.slice("__error__".length) : m.content;
            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-lg px-3 py-2 max-w-[95%]",
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : isError
                      ? "mr-auto bg-destructive/10 border border-destructive/20 text-destructive"
                      : "mr-auto bg-secondary text-foreground",
                )}
              >
                <p className="whitespace-pre-wrap text-xs leading-relaxed">{displayContent}</p>
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
                  <Badge variant="outline" className="mt-2 text-[10px]">
                    v{m.version}
                  </Badge>
                )}
              </div>
            );
          })}
          {/* Tool status pills during streaming */}
          {streaming && toolStatus && (
            <div className="mr-auto">
              <ToolPill tool="" message={toolStatus} active={true} />
            </div>
          )}
          {/* Thinking or idle spinner */}
          {busy && !streaming && <ThinkingAnimation statusText={statusText} thinkingContent={thinking} />}
          {streaming && !toolStatus && (
            <ThinkingAnimation statusText={statusText ?? "Agent working…"} thinkingContent={thinking} />
          )}
          {/* Retry hint outside messages when last action failed */}
          {!busy && !streaming && lastErrorMsg && lastPrompt && onRetry && messages.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <RefreshCw className="w-3 h-3 shrink-0" />
              <span>Generation failed. Edit your prompt or try again.</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Context + Input */}
      <div className="border-t shrink-0">
        {/* Context file section */}
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
          onClick={() => setContextOpen((o) => !o)}
        >
          <span className="flex items-center gap-1.5">
            <Paperclip className="w-3 h-3" />
            Context files
            <span className={cn(
              "px-1.5 py-0.5 rounded-full text-[10px] font-medium",
              contextFiles.length > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}>
              {contextFiles.length}/{MAX_CONTEXT_FILES}
            </span>
          </span>
          {contextOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {contextOpen && (
          <div
            className={cn(
              "px-4 pb-3 space-y-2 transition-colors",
              dragOver && "bg-primary/5 border-primary/20",
            )}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
            }}
          >
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "w-full gap-2 text-xs border-dashed",
                dragOver && "border-primary bg-primary/5",
              )}
              disabled={busy || streaming || uploadingContext || slotsLeft <= 0}
              onClick={() => fileRef.current?.click()}
            >
              {uploadingContext ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Extracting text…
                </>
              ) : (
                <>
                  <Paperclip className="w-3.5 h-3.5" />
                  {slotsLeft <= 0
                    ? "Maximum 20 files reached"
                    : dragOver
                      ? "Drop to upload"
                      : `Upload PDF, DOC, image, Excel — ${slotsLeft} slot${slotsLeft !== 1 ? "s" : ""} left`}
                </>
              )}
            </Button>
            {contextFiles.length > 0 && (
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {contextFiles.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-2 py-1"
                  >
                    {fileIcon(f.filename)}
                    <span className="truncate flex-1 font-medium text-foreground/80">{f.filename}</span>
                    {f.extractedText && (
                      <Badge variant="outline" className="text-[9px] h-3.5 px-1 shrink-0 text-green-700 border-green-200">
                        extracted
                      </Badge>
                    )}
                    {onContextDelete && (
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove file"
                        onClick={() => void onContextDelete(f.id)}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Prompt input */}
        <div className="p-3 pt-0 space-y-2 border-t">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe columns, edits, or ask to remove rows/columns…"
            rows={2}
            disabled={busy || streaming}
            className="text-sm resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <div className="flex gap-2">
            <Button className="flex-1 gap-2" disabled={busy || streaming || !input.trim()} onClick={handleSend}>
              {(busy || streaming) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {streaming ? "Agent running…" : busy ? "Building…" : "Send"}
            </Button>
            {onRetry && !busy && !streaming && lastErrorMsg && (
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={onRetry}
                title="Retry last prompt"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
