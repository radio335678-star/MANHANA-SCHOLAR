import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Brain,
  CheckCircle2,
  Globe,
  Loader2,
  Pencil,
  Send,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  User,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  usePreThesisChatStream,
  type ActivityEntry,
  type PreThesisChatMessage,
  type PreThesisChatStreamEvent,
} from "@/hooks/usePreThesisChatStream";
import type { PreThesisDocumentV2 } from "@/lib/preThesisDocumentTypes";

type PreThesisAiAssistantProps = {
  workspaceId: number;
  disabled?: boolean;
  onDocumentUpdated?: (event: Extract<PreThesisChatStreamEvent, { type: "document_updated" }>) => void;
  onStreamingChange?: (streaming: boolean) => void;
  className?: string;
};

function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  if (!entries.length) return null;
  return (
    <div className="space-y-1.5 text-xs">
      {entries.map((entry, i) => {
        if (entry.kind === "thinking") {
          return (
            <div key={i} className="flex items-center gap-2 text-muted-foreground">
              <Brain className="w-3.5 h-3.5 animate-pulse text-violet-500 shrink-0" />
              <span>Analysing your request…</span>
            </div>
          );
        }
        if (entry.kind === "searching") {
          return (
            <div key={i} className="flex items-center gap-2 text-muted-foreground">
              <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>Searching university guidelines…</span>
            </div>
          );
        }
        if (entry.kind === "patch_done") {
          return (
            <div key={i} className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium">{entry.summary}</span>
            </div>
          );
        }
        if (entry.kind === "tool") {
          return (
            <div key={i} className="flex items-center gap-2">
              {entry.status === "running" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
              ) : entry.status === "ok" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
              )}
              <Pencil className="w-3 h-3 text-muted-foreground shrink-0" />
              <span
                className={cn(
                  "text-muted-foreground",
                  entry.status === "ok" && "text-green-700 dark:text-green-400",
                  entry.status === "error" && "text-destructive",
                )}
              >
                {entry.label}
              </span>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function AssistantMessage({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1 leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("**") && line.endsWith("**")) {
          return (
            <p key={i} className="font-semibold">
              {line.slice(2, -2)}
            </p>
          );
        }
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <p key={i} className="pl-3 before:content-['•'] before:mr-2 before:text-primary">
              {line.slice(2)}
            </p>
          );
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

export function PreThesisAiAssistant({
  workspaceId,
  disabled,
  onDocumentUpdated,
  onStreamingChange,
  className,
}: PreThesisAiAssistantProps) {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<PreThesisChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamAccumulator = useRef("");

  const { streaming, streamContent, activityLog, stop, sendMessage, resetStream } =
    usePreThesisChatStream();

  useEffect(() => {
    onStreamingChange?.(streaming);
  }, [streaming, onStreamingChange]);

  useEffect(() => {
    if (disabled) {
      setLoadingHistory(false);
      return;
    }
    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`/api/workspaces/${workspaceId}/pre-thesis/chat`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = (await res.json()) as PreThesisChatMessage[];
          setMessages(data.filter((m) => m.role === "user" || m.role === "assistant"));
        }
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [workspaceId, getToken, disabled]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent, activityLog]);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 22;
    const maxHeight = lineHeight * 6 + 16;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming || disabled) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    resetStream();
    streamAccumulator.current = "";

    await sendMessage(workspaceId, text, getToken, (event) => {
      if (event.type === "token") {
        streamAccumulator.current += event.content;
      }
      if (event.type === "document_updated") {
        onDocumentUpdated?.(event);
      }
      if (event.type === "done") {
        const content = event.content || streamAccumulator.current || "Done.";
        setMessages((prev) => [...prev, { role: "assistant", content }]);
      }
      if (event.type === "error") {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${event.message}` },
        ]);
      }
    });
  };

  const handleStop = () => {
    stop();
    if (streamAccumulator.current) {
      setMessages((prev) => [...prev, { role: "assistant", content: streamAccumulator.current }]);
    }
    resetStream();
  };

  const handleClear = async () => {
    if (!confirm("Clear assistant conversation?")) return;
    const token = await getToken();
    await fetch(`/api/workspaces/${workspaceId}/pre-thesis/chat/clear`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setMessages([]);
    resetStream();
  };

  const handleUndo = async () => {
    const token = await getToken();
    const res = await fetch(`/api/workspaces/${workspaceId}/pre-thesis/revisions/undo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const json = (await res.json()) as {
      resultJson: unknown;
      preThesisDraftMd: string;
      completenessScore: number;
      summary?: string;
    };
    onDocumentUpdated?.({
      type: "document_updated",
      document: json.resultJson as PreThesisDocumentV2,
      draftMd: json.preThesisDraftMd,
      completenessScore: json.completenessScore,
      summary: json.summary ?? "Undone",
    });
  };

  const charCount = input.length;

  return (
    <div
      className={cn(
        "flex flex-col h-full border rounded-2xl bg-card overflow-hidden shadow-md",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0 bg-gradient-to-r from-primary/5 to-violet-500/5">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm leading-none">Customize with AI</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">
              Pre-Thesis Structure Assistant
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Undo last AI change"
            disabled={disabled || streaming}
            onClick={() => void handleUndo()}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Clear chat"
            disabled={disabled || streaming}
            onClick={() => void handleClear()}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-4 px-4 py-4 text-sm">
          {loadingHistory && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground py-8">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading conversation…</span>
            </div>
          )}
          {!loadingHistory && messages.length === 0 && (
            <div className="text-center py-8 space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-sm">Pre-Thesis AI Assistant</p>
                <p className="text-muted-foreground text-xs max-w-[240px] mx-auto">
                  Ask me to adjust formatting, chapters, references, or any pre-thesis structure.
                  Changes sync to the preview automatically.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {[
                  "Add bibliography section",
                  "Fix formatting specs",
                  "Add ethics page",
                ].map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    onClick={() => {
                      setInput(hint);
                      textareaRef.current?.focus();
                    }}
                    className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted/50 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-2.5 max-w-full",
                m.role === "user" ? "flex-row-reverse" : "flex-row",
              )}
            >
              {/* Avatar */}
              <div
                className={cn(
                  "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400",
                )}
              >
                {m.role === "user" ? (
                  <User className="w-3.5 h-3.5" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
              </div>
              {/* Bubble */}
              <div
                className={cn(
                  "rounded-2xl px-3.5 py-2.5 max-w-[85%] text-sm",
                  m.role === "user"
                    ? "rounded-tr-sm bg-primary text-primary-foreground"
                    : "rounded-tl-sm bg-muted/60 border border-border/50 text-foreground",
                )}
              >
                {m.role === "assistant" ? (
                  <AssistantMessage content={m.content} />
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            </div>
          ))}

          {/* Streaming bubble */}
          {streaming && (
            <div className="flex gap-2.5 flex-row">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-muted/60 border border-border/50 px-3.5 py-2.5 max-w-[85%] space-y-2.5 text-sm">
                <ActivityFeed entries={activityLog} />
                {streamContent && (
                  <AssistantMessage content={streamContent} />
                )}
                {!streamContent && !activityLog.length && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Thinking…</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Status bar */}
      {streaming && (
        <div className="px-4 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200/50 dark:border-amber-800/30 shrink-0">
          <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            Working… deep analysis may take 1–3 minutes
          </p>
        </div>
      )}

      {/* Input area */}
      <div className="p-3 border-t shrink-0 space-y-2 bg-card">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoResize();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="e.g. Add ethics committee page, update Chapter 3 bullets, change body font to Times New Roman 12pt…"
            rows={2}
            disabled={disabled || streaming}
            className={cn(
              "w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "min-h-[64px] max-h-[148px] transition-all",
            )}
          />
          {charCount > 200 && (
            <span
              className={cn(
                "absolute bottom-2 right-2 text-[10px] tabular-nums",
                charCount > 7800 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {charCount}/8000
            </span>
          )}
        </div>

        <div className="flex gap-2">
          {streaming ? (
            <Button
              variant="destructive"
              className="flex-1 gap-2"
              onClick={handleStop}
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </Button>
          ) : (
            <Button
              className="flex-1 gap-2"
              disabled={disabled || !input.trim()}
              onClick={() => void handleSend()}
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </Button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground text-center">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
