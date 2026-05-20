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
  X,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChartContextFile } from "@/lib/masterChartTypes";

const MAX_CONTEXT_FILES = 20;

const SUGGESTED_PROMPTS = [
  "80 patients, age/sex/group/outcome scores",
  "Add BMI and blood pressure columns after Age",
  "Remove duplicate columns and clean sample rows",
  "Generate sample data for 30 rows",
];

type MasterChartAiAssistantProps = {
  messages: ChatMessage[];
  busy: boolean;
  statusText?: string;
  contextFiles: ChartContextFile[];
  onSend: (text: string) => void;
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
  contextFiles,
  onSend,
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
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">AI Dataset Builder</span>
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

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-3 py-4 text-sm min-h-[120px]">
          {messages.length === 0 && !busy && (
            <div className="space-y-3">
              <p className="text-muted-foreground text-center px-2 text-xs leading-relaxed">
                Upload PDFs, images, or docs for context (up to 20 files). AI reads everything
                before building. Chat to create or edit the sheet — each message saves a new version.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
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
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "rounded-lg px-3 py-2 max-w-[95%]",
                m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "mr-auto bg-secondary text-foreground",
              )}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.version != null && m.role === "assistant" && (
                <Badge variant="outline" className="mt-2 text-[10px]">
                  v{m.version}
                </Badge>
              )}
            </div>
          ))}
          {busy && (
            <div className="mr-auto bg-secondary rounded-lg px-3 py-2 max-w-[95%] space-y-1">
              <p className="text-xs text-primary flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                {statusText ?? "Building master chart…"}
              </p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t shrink-0">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:bg-muted/30"
          onClick={() => setContextOpen((o) => !o)}
        >
          <span className="flex items-center gap-1">
            <Paperclip className="w-3 h-3" />
            Context files ({contextFiles.length}/{MAX_CONTEXT_FILES})
          </span>
          {contextOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {contextOpen && (
          <div
            className={cn("px-4 pb-3 space-y-2", dragOver && "bg-primary/5")}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
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
              className="w-full gap-2 text-xs"
              disabled={busy || uploadingContext || slotsLeft <= 0}
              onClick={() => fileRef.current?.click()}
            >
              {uploadingContext ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Paperclip className="w-3.5 h-3.5" />
              )}
              {slotsLeft <= 0
                ? "Maximum 20 files reached"
                : `Upload files (PDF, DOC, images, Excel) — ${slotsLeft} left`}
            </Button>
            {contextFiles.length > 0 && (
              <ul className="space-y-1 max-h-28 overflow-y-auto">
                {contextFiles.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    {f.filename.match(/\.(png|jpe?g|webp|gif)$/i) ? (
                      <ImageIcon className="w-3 h-3 shrink-0" />
                    ) : (
                      <FileText className="w-3 h-3 shrink-0" />
                    )}
                    <span className="truncate flex-1">{f.filename}</span>
                    {onContextDelete && (
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
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

        <div className="p-3 pt-0 space-y-2 border-t">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe columns, edits, or ask to remove rows/columns…"
            rows={2}
            disabled={busy}
            className="text-sm resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button className="w-full gap-2" disabled={busy || !input.trim()} onClick={handleSend}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
