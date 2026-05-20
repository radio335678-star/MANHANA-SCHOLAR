import { useCallback, useRef, useState } from "react";

export type TelemetryEvent = {
  type: string;
  message: string;
  progress?: number;
  agent?: string;
  timestamp?: string;
};

export function usePreThesisBuildStream() {
  const [telemetry, setTelemetry] = useState<TelemetryEvent[]>([]);
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const streamBuild = useCallback(
    async (
      workspaceId: number,
      jobId: number,
      getToken: () => Promise<string | null>,
    ): Promise<"complete" | "error"> => {
      setBuilding(true);
      setError(null);
      setTelemetry([]);
      setProgress(0);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const token = await getToken();
        const res = await fetch(
          `/api/workspaces/${workspaceId}/pre-thesis/build/${jobId}/stream`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: controller.signal,
          },
        );
        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let outcome: "complete" | "error" = "complete";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6)) as TelemetryEvent;
              setTelemetry((prev) => [...prev, event]);
              if (typeof event.progress === "number") {
                setProgress(event.progress);
              }
              if (event.type === "complete") outcome = "complete";
              if (event.type === "error") {
                outcome = "error";
                setError(event.message);
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }
        return outcome;
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError(e instanceof Error ? e.message : "Build stream failed");
        }
        return "error";
      } finally {
        setBuilding(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setTelemetry([]);
    setProgress(0);
    setError(null);
    setBuilding(false);
  }, []);

  return { telemetry, building, progress, error, streamBuild, reset, setBuilding };
}
