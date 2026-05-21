import { useCallback, useState } from "react";

export type VisionStreamEvent =
  | { type: "ping" }
  | { type: "files_accepted"; count: number; names: string[] }
  | { type: "thinking"; content: string }
  | { type: "token"; content: string }
  | { type: "done"; sessionId?: number; totalTokens: number; modelUsed: string; content: string }
  | { type: "error"; message: string };

export type VisionSession = {
  id: number;
  filesInfo: Array<{ name: string; size: number; mimeType: string; kimiFileId?: string }>;
  outputText?: string;
  userPrompt?: string | null;
  tokensUsed?: number | null;
  modelUsed?: string | null;
  createdAt: string;
};

export function useVisionReaderStream() {
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [thinkingContent, setThinkingContent] = useState("");
  const [lastSessionId, setLastSessionId] = useState<number | null>(null);
  const [lastPingAt, setLastPingAt] = useState<number | null>(null);

  const analyze = useCallback(
    async (
      workspaceId: number,
      files: File[],
      prompt: string | null,
      getToken: () => Promise<string | null>,
      onEvent: (event: VisionStreamEvent) => void,
    ): Promise<void> => {
      setStreaming(true);
      setStreamContent("");
      setThinkingContent("");
      setLastSessionId(null);

      const token = await getToken();
      const form = new FormData();
      for (const file of files) form.append("files", file);
      if (prompt?.trim()) form.append("prompt", prompt.trim());

      let res: Response;
      try {
        res = await fetch(
          `/api/workspaces/${workspaceId}/vision-reader/analyze/stream`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          },
        );
      } catch {
        onEvent({ type: "error", message: "Network error — please check your connection." });
        setStreaming(false);
        return;
      }

      if (!res.ok || !res.body) {
        const err = await res
          .json()
          .catch(() => ({ error: `Request failed (${res.status})` })) as { error?: string };
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
              const event = JSON.parse(line.slice(6)) as VisionStreamEvent;
              onEvent(event);

              switch (event.type) {
                case "token":
                  setStreamContent((prev) => prev + event.content);
                  break;
                case "thinking":
                  setThinkingContent((prev) => prev + event.content);
                  break;
                case "done":
                  if (event.sessionId) setLastSessionId(event.sessionId);
                  if (event.content) setStreamContent(event.content);
                  break;
                case "ping":
                  setLastPingAt(Date.now());
                  break;
                default:
                  break;
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }

        // Flush trailing SSE frame (last chunk may not end with newline)
        if (buffer.startsWith("data: ")) {
          try {
            const event = JSON.parse(buffer.slice(6)) as VisionStreamEvent;
            onEvent(event);
            if (event.type === "token") {
              setStreamContent((prev) => prev + event.content);
            } else if (event.type === "thinking") {
              setThinkingContent((prev) => prev + event.content);
            } else if (event.type === "done") {
              if (event.sessionId) setLastSessionId(event.sessionId);
              if (event.content) setStreamContent(event.content);
            }
          } catch {
            /* ignore parse errors */
          }
        }
      } finally {
        setStreaming(false);
      }
    },
    [],
  );

  const fetchSessions = useCallback(
    async (
      workspaceId: number,
      getToken: () => Promise<string | null>,
    ): Promise<VisionSession[]> => {
      const token = await getToken();
      const res = await fetch(`/api/workspaces/${workspaceId}/vision-reader/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return (await res.json()) as VisionSession[];
    },
    [],
  );

  const fetchSession = useCallback(
    async (
      workspaceId: number,
      sessionId: number,
      getToken: () => Promise<string | null>,
    ): Promise<VisionSession | null> => {
      const token = await getToken();
      const res = await fetch(
        `/api/workspaces/${workspaceId}/vision-reader/sessions/${sessionId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return null;
      return (await res.json()) as VisionSession;
    },
    [],
  );

  const saveToVault = useCallback(
    async (
      workspaceId: number,
      sessionId: number,
      title: string | undefined,
      getToken: () => Promise<string | null>,
    ): Promise<{ ok: boolean; vaultResourceId?: number }> => {
      const token = await getToken();
      const res = await fetch(
        `/api/workspaces/${workspaceId}/vision-reader/sessions/${sessionId}/vault-save`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title }),
        },
      );
      if (!res.ok) return { ok: false };
      return (await res.json()) as { ok: boolean; vaultResourceId?: number };
    },
    [],
  );

  return {
    streaming,
    streamContent,
    thinkingContent,
    lastSessionId,
    lastPingAt,
    analyze,
    fetchSessions,
    fetchSession,
    saveToVault,
    reset: () => {
      setStreamContent("");
      setThinkingContent("");
      setLastSessionId(null);
      setLastPingAt(null);
    },
  };
}
