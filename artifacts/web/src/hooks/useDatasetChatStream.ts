import { useCallback, useState } from "react";

export type DatasetChatMessage = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  tokensUsed?: number;
};

export type WorkbookSheetSchema = {
  name: string;
  columnCount: number;
  rowCount: number;
  columns: Array<{ header: string; type: string }>;
};

export type WorkbookStateEvent = {
  name: string;
  sheets: Array<{
    name: string;
    columns: Array<{ header: string; type: string; validation?: Record<string, unknown> }>;
    sampleRows: Record<string, unknown>[];
  }>;
};

export type DatasetChatStreamEvent =
  | { type: "thinking"; content: string }
  | { type: "token"; content: string }
  | { type: "tool_start"; tool: string; message: string }
  | { type: "tool_done"; tool: string; message: string; ok: boolean }
  | { type: "sheet_updated"; workbook: WorkbookStateEvent; summary: string }
  | { type: "version_committed"; version: number; vaultResourceId?: number; summary: string }
  | { type: "ping" }
  | { type: "done"; totalTokens: number; content: string }
  | { type: "error"; message: string };

export function useDatasetChatStream() {
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [thinking, setThinking] = useState("");
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [liveWorkbook, setLiveWorkbook] = useState<WorkbookStateEvent | null>(null);
  const [lastPingAt, setLastPingAt] = useState<number | null>(null);

  const sendMessage = useCallback(
    async (
      workspaceId: number,
      chartId: number,
      content: string,
      getToken: () => Promise<string | null>,
      onEvent: (event: DatasetChatStreamEvent) => void,
    ): Promise<void> => {
      setStreaming(true);
      setStreamContent("");
      setThinking("");
      setToolStatus(null);

      const token = await getToken();

      let res: Response;
      try {
        res = await fetch(
          `/api/workspaces/${workspaceId}/master-charts/${chartId}/chat/stream`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ content }),
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
              const event = JSON.parse(line.slice(6)) as DatasetChatStreamEvent;
              onEvent(event);

              switch (event.type) {
                case "token":
                  setStreamContent((prev) => prev + event.content);
                  break;
                case "thinking":
                  setThinking((prev) => prev + event.content);
                  break;
                case "tool_start":
                  setToolStatus(event.message);
                  break;
                case "tool_done":
                  setToolStatus(event.ok ? null : event.message);
                  break;
                case "sheet_updated":
                  setLiveWorkbook(event.workbook);
                  break;
                case "ping":
                  setLastPingAt(Date.now());
                  break;
                case "done":
                case "error":
                  break;
              }
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
    liveWorkbook,
    lastPingAt,
    sendMessage,
    resetStream: () => {
      setStreamContent("");
      setThinking("");
      setToolStatus(null);
      setLiveWorkbook(null);
      setLastPingAt(null);
    },
  };
}
