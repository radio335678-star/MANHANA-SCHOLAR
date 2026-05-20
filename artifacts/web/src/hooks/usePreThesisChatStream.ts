import { useCallback, useState } from "react";
import type { PreThesisDocumentV2 } from "@/lib/preThesisDocumentTypes";

export type PreThesisChatMessage = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

export type PreThesisChatStreamEvent =
  | { type: "thinking"; content: string }
  | { type: "token"; content: string }
  | { type: "tool_start"; tool: string; message: string }
  | { type: "tool_done"; tool: string; message: string; ok: boolean }
  | {
      type: "document_updated";
      document: PreThesisDocumentV2;
      draftMd: string;
      completenessScore: number;
      summary: string;
      scrollAnchor?: string;
    }
  | { type: "done"; totalTokens: number; content: string }
  | { type: "error"; message: string };

export function usePreThesisChatStream() {
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [thinking, setThinking] = useState("");
  const [toolStatus, setToolStatus] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (
      workspaceId: number,
      content: string,
      getToken: () => Promise<string | null>,
      onEvent: (event: PreThesisChatStreamEvent) => void,
    ): Promise<void> => {
      setStreaming(true);
      setStreamContent("");
      setThinking("");
      setToolStatus(null);

      const token = await getToken();
      const res = await fetch(`/api/workspaces/${workspaceId}/pre-thesis/chat/stream`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        onEvent({ type: "error", message: err.error ?? "Request failed" });
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6)) as PreThesisChatStreamEvent;
              if (event.type === "token") {
                setStreamContent((prev) => prev + event.content);
              } else if (event.type === "thinking") {
                setThinking(event.content);
              } else if (event.type === "tool_start") {
                setToolStatus(event.message);
              } else if (event.type === "tool_done") {
                setToolStatus(event.ok ? null : event.message);
              }
              onEvent(event);
            } catch {
              /* ignore parse errors */
            }
          }
        }
      } finally {
        setStreaming(false);
        setToolStatus(null);
      }
    },
    [],
  );

  return {
    streaming,
    streamContent,
    thinking,
    toolStatus,
    sendMessage,
    resetStream: () => {
      setStreamContent("");
      setThinking("");
      setToolStatus(null);
    },
  };
}
