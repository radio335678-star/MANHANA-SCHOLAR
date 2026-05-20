import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Sparkles, Undo2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  usePreThesisChatStream,
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
  const streamAccumulator = useRef("");

  const { streaming, streamContent, thinking, toolStatus, sendMessage, resetStream } =
    usePreThesisChatStream();

  useEffect(() => {
    onStreamingChange?.(streaming);
  }, [streaming, onStreamingChange]);

  useEffect(() => {
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
  }, [workspaceId, getToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent, thinking]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming || disabled) return;

    setInput("");
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
    const json = await res.json();
    onDocumentUpdated?.({
      type: "document_updated",
      document: json.resultJson as PreThesisDocumentV2,
      draftMd: json.preThesisDraftMd,
      completenessScore: json.completenessScore,
      summary: json.summary ?? "Undone",
    });
  };

  return (
    <div className={cn("flex flex-col h-full min-h-[320px] border rounded-xl bg-card", className)}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">Customize with AI</span>
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

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-3 py-4 text-sm">
          {loadingHistory && (
            <p className="text-muted-foreground text-center">Loading conversation…</p>
          )}
          {!loadingHistory && messages.length === 0 && (
            <p className="text-muted-foreground text-center px-2">
              Ask the assistant to adjust formatting, chapters, sources, or any pre-thesis
              structure. Changes sync to the document preview automatically.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg px-3 py-2 max-w-[95%]",
                m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "mr-auto bg-secondary text-foreground",
              )}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
          {streaming && (streamContent || thinking || toolStatus) && (
            <div className="mr-auto bg-secondary rounded-lg px-3 py-2 max-w-[95%] space-y-1">
              {thinking && (
                <p className="text-xs text-muted-foreground italic line-clamp-3">{thinking}</p>
              )}
              {toolStatus && (
                <p className="text-xs text-primary flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {toolStatus}
                </p>
              )}
              {streamContent && <p className="whitespace-pre-wrap">{streamContent}</p>}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="p-3 border-t shrink-0 space-y-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Add ethics committee page, update Chapter 3 bullets, change body font to Times New Roman 12pt…"
          rows={2}
          disabled={disabled || streaming}
          className="text-sm resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <Button
          className="w-full gap-2"
          disabled={disabled || streaming || !input.trim()}
          onClick={() => void handleSend()}
        >
          {streaming ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Send
        </Button>
      </div>
    </div>
  );
}
