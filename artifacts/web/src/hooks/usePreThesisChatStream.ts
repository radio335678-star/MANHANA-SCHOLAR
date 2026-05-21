import { useCallback, useRef, useState } from "react";
import type { PreThesisDocumentV2 } from "@/lib/preThesisDocumentTypes";

export type PreThesisChatMessage = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

export type ActivityEntry =
  | { kind: "thinking" }
  | { kind: "tool"; tool: string; label: string; status: "running" | "ok" | "error" }
  | { kind: "patch_done"; summary: string }
  | { kind: "searching" };

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
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

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
      setActivityLog([]);

      const controller = new AbortController();
      abortRef.current = controller;

      const token = await getToken();

      let res: Response;
      try {
        res = await fetch(`/api/workspaces/${workspaceId}/pre-thesis/chat/stream`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content }),
          signal: controller.signal,
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStreaming(false);
          setActivityLog([]);
          return;
        }
        onEvent({ type: "error", message: "Request failed" });
        setStreaming(false);
        return;
      }

      if (!res.ok || !res.body) {
        const errJson = await res.json().catch(() => ({ error: "Request failed" }));
        onEvent({ type: "error", message: (errJson as { error?: string }).error ?? "Request failed" });
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
                setActivityLog((prev) => {
                  if (prev.some((e) => e.kind === "thinking")) return prev;
                  return [...prev, { kind: "thinking" }];
                });
              } else if (event.type === "tool_start") {
                const isSearch = event.tool === "web_search";
                setToolStatus(event.message);
                if (isSearch) {
                  setActivityLog((prev) => [...prev, { kind: "searching" }]);
                } else {
                  setActivityLog((prev) => [
                    ...prev,
                    { kind: "tool", tool: event.tool, label: event.message, status: "running" },
                  ]);
                }
              } else if (event.type === "tool_done") {
                setToolStatus(event.ok ? null : event.message);
                setActivityLog((prev) =>
                  prev.map((e) =>
                    e.kind === "tool" && e.tool === event.tool && e.status === "running"
                      ? { ...e, status: event.ok ? ("ok" as const) : ("error" as const) }
                      : e,
                  ),
                );
              } else if (event.type === "document_updated") {
                setActivityLog((prev) => [
                  ...prev,
                  { kind: "patch_done", summary: event.summary },
                ]);
              }

              onEvent(event);
            } catch {
              /* ignore parse errors */
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          onEvent({ type: "error", message: "Stream interrupted" });
        }
      } finally {
        setStreaming(false);
        setToolStatus(null);
        abortRef.current = null;
      }
    },
    [],
  );

  return {
    streaming,
    streamContent,
    thinking,
    toolStatus,
    activityLog,
    stop,
    sendMessage,
    resetStream: () => {
      setStreamContent("");
      setThinking("");
      setToolStatus(null);
      setActivityLog([]);
    },
  };
}
