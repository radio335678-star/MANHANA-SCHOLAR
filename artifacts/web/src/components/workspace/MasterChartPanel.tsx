import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import { useDatasetChatStream, type DatasetChatMessage, type DatasetChatStreamEvent } from "@/hooks/useDatasetChatStream";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Loader2,
  Download,
  Upload,
  Table2,
  Plus,
  BookOpen,
  CheckCircle2,
  Database,
  X,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Sparkles,
  Eye,
} from "lucide-react";
import { VisionReaderPanel } from "@/components/workspace/VisionReaderPanel";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { MasterChartAiAssistant } from "@/components/workspace/MasterChartAiAssistant";
import { MasterChartSpreadsheet } from "@/components/workspace/MasterChartSpreadsheet";
import { MasterChartStats } from "@/components/workspace/MasterChartStats";
import { MasterChartVersionBar, type VersionMeta } from "@/components/workspace/MasterChartVersionBar";
import {
  type ChartContextFile,
  type ChartVersionPreview,
  type ChatMessage,
  parseSheetSpec,
  getWorkbookSheets,
} from "@/lib/masterChartTypes";

type ChartRow = {
  id: number;
  name: string;
  mode: string;
  currentVersion: number;
  createdAt: string;
};

type LayoutMode = "split" | "fullscreen" | "collapsed";

const GUIDE_DISMISS_KEY = (workspaceId: number) => `dataset-guide-dismissed-${workspaceId}`;

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function safeErrorMessage(res: Response): Promise<string> {
  try {
    const j = await res.json() as { error?: string; message?: string };
    return j.error ?? j.message ?? `Request failed (${res.status})`;
  } catch {
    const t = await res.text().catch(() => "");
    if (t.toLowerCase().startsWith("<!")) return `Server error (${res.status}) — please try again`;
    return t.slice(0, 200) || `Request failed (${res.status})`;
  }
}

function buildAssistantReply(spec: ReturnType<typeof parseSheetSpec>, version: number) {
  const sheets = getWorkbookSheets(spec);
  const sheetCount = sheets.length;
  const colCount = sheets.reduce((n, s) => n + (s.columns?.length ?? 0), 0);
  const rowCount = sheets.reduce((n, s) => n + (s.sampleRows?.length ?? 0), 0);

  if (sheetCount > 1) {
    return `Built master chart v${version} with ${sheetCount} Excel sheets (${colCount} columns, ${rowCount} rows total). Download XLSX for all sheets. Saved to vault when storage is configured.`;
  }

  const cols = spec.columns?.map((c) => c.header).join(", ") ?? "columns";
  const rows = spec.sampleRows?.length ?? 0;
  return `Updated master chart v${version} with ${spec.columns?.length ?? 0} columns (${cols}).${rows > 0 ? ` ${rows} rows included.` : ""} Saved to vault when storage is configured.`;
}

export function MasterChartPanel({
  workspaceId,
  workflowState,
  showGuide = false,
}: {
  workspaceId: number;
  workflowState: string;
  showGuide?: boolean;
}) {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [charts, setCharts] = useState<ChartRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("Master Data Table");
  const [newMode, setNewMode] = useState<string>("chat_to_excel");
  const [guideOpen, setGuideOpen] = useState(showGuide);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("split");
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [mobileAiOpen, setMobileAiOpen] = useState(false);
  const [contextFiles, setContextFiles] = useState<ChartContextFile[]>([]);
  const [versionCache, setVersionCache] = useState<Record<number, ChartVersionPreview>>({});
  const [selectedVersion, setSelectedVersion] = useState(0);
  const [currentVersion, setCurrentVersion] = useState(0);
  const [highlightHeaders, setHighlightHeaders] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [statusText, setStatusText] = useState<string>();
  const [deletingVersion, setDeletingVersion] = useState<number | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"dataset" | "vision">("dataset");
  const [visionTabHighlight, setVisionTabHighlight] = useState(false);
  const panelTabsRef = useRef<HTMLDivElement>(null);
  const visionHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Streaming agent hook
  const {
    streaming,
    thinking,
    toolStatus,
    liveWorkbook,
    lastPingAt,
    sendMessage: streamSendMessage,
    resetStream,
  } = useDatasetChatStream();

  const gated =
    workflowState === "locked_in" ||
    workflowState === "section_build" ||
    workflowState === "review" ||
    workflowState === "complete";

  useEffect(() => {
    const dismissed = localStorage.getItem(GUIDE_DISMISS_KEY(workspaceId));
    if (showGuide && !dismissed) setGuideOpen(true);
  }, [showGuide, workspaceId]);

  useEffect(() => {
    if (layoutMode !== "fullscreen") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLayoutMode("split");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layoutMode]);

  // Load chat history from server when chart changes
  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch(
          `/api/workspaces/${workspaceId}/master-charts/${selectedId}/chat`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) { setMessages([]); return; }
        const rows = (await res.json()) as DatasetChatMessage[];
        setMessages(
          rows.map((m) => ({
            id: `srv-${m.id ?? m.createdAt ?? Math.random()}`,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
          })),
        );
      } catch {
        setMessages([]);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const authFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await getToken();
      return fetch(`/api/workspaces/${workspaceId}${path}`, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
      });
    },
    [workspaceId, getToken],
  );

  const applyDetail = useCallback((data: {
    version: ChartVersionPreview | null;
    versions?: Array<{
      version: number;
      schemaJson?: Record<string, unknown> | null;
      statsSummary?: Record<string, unknown> | null;
      vaultResourceId?: number | null;
    }>;
    contextFiles?: ChartContextFile[];
    chart: ChartRow;
  }) => {
    setContextFiles(data.contextFiles ?? []);
    setCurrentVersion(data.chart.currentVersion);
    setSelectedVersion(data.chart.currentVersion);

    const cacheUpdates: Record<number, ChartVersionPreview> = {};
    for (const v of data.versions ?? []) {
      if (v.schemaJson) {
        cacheUpdates[v.version] = {
          version: v.version,
          schemaJson: parseSheetSpec(v.schemaJson),
          statsSummary: v.statsSummary ?? undefined,
          vaultResourceId: v.vaultResourceId,
        };
      }
    }
    if (data.version) {
      cacheUpdates[data.version.version] = {
        version: data.version.version,
        schemaJson: data.version.schemaJson ?? parseSheetSpec({}),
        statsSummary: data.version.statsSummary,
        vaultResourceId: data.version.vaultResourceId,
      };
    }
    if (Object.keys(cacheUpdates).length > 0) {
      setVersionCache((prev) => ({ ...prev, ...cacheUpdates }));
    }
  }, []);

  const loadCharts = useCallback(async () => {
    const res = await authFetch("/master-charts");
    if (!res.ok) throw new Error("Failed to load charts");
    const list = (await res.json()) as ChartRow[];
    setCharts(list);
    if (list.length > 0 && selectedId === null) setSelectedId(list[0].id);
  }, [authFetch, selectedId]);

  const loadDetail = useCallback(
    async (chartId: number) => {
      const res = await authFetch(`/master-charts/${chartId}`);
      if (!res.ok) return;
      const data = await res.json();
      applyDetail({
        chart: data.chart,
        version: data.version
          ? {
              version: data.version.version,
              schemaJson: parseSheetSpec(data.version.schemaJson),
              statsSummary: data.version.statsSummary,
              vaultResourceId: data.version.vaultResourceId,
            }
          : null,
        versions: data.versions,
        contextFiles: data.contextFiles,
      });
    },
    [authFetch, applyDetail],
  );

  useEffect(() => {
    loadCharts()
      .catch(() => toast({ title: "Failed to load datasets", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [loadCharts, toast]);

  useEffect(() => {
    if (selectedId) {
      setVersionCache({});
      void loadDetail(selectedId);
    }
  }, [selectedId, loadDetail]);

  // Use live workbook during streaming OR immediately after stream ends (until version cache loads)
  const liveSpec = liveWorkbook
    ? parseSheetSpec(liveWorkbook as unknown as Record<string, unknown>)
    : null;
  const cachedLivePreview = versionCache["_live" as unknown as number];
  const activePreview =
    versionCache[selectedVersion] ?? versionCache[currentVersion] ?? null;
  // Show live workbook while streaming; keep showing it after stream if no committed version yet
  const activeSpec =
    liveSpec ??
    cachedLivePreview?.schemaJson ??
    activePreview?.schemaJson ??
    { columns: [], sampleRows: [] };
  const workbookSheets = getWorkbookSheets(activeSpec);
  const totalCols = workbookSheets.reduce((n, s) => n + (s.columns?.length ?? 0), 0);
  const totalRows = workbookSheets.reduce((n, s) => n + (s.sampleRows?.length ?? 0), 0);

  const versionMetas: VersionMeta[] = Array.from({ length: currentVersion }, (_, i) => i + 1).map(
    (v) => ({
      version: v,
      vaultResourceId: versionCache[v]?.vaultResourceId,
      available: Boolean(versionCache[v]),
    }),
  );

  const loadVersion = useCallback(
    async (version: number) => {
      if (!selectedId) return;
      setSelectedVersion(version);
      if (versionCache[version]) return;

      const res = await authFetch(`/master-charts/${selectedId}/versions/${version}`);
      if (!res.ok) {
        toast({ title: `Could not load v${version}`, variant: "destructive" });
        return;
      }
      const data = await res.json();
      const preview: ChartVersionPreview = {
        version: data.version,
        schemaJson: parseSheetSpec(data.schemaJson),
        statsSummary: data.statsSummary,
        vaultResourceId: data.vaultResourceId,
      };
      setVersionCache((prev) => ({ ...prev, [version]: preview }));
    },
    [authFetch, selectedId, versionCache, toast],
  );

  const handleCreate = async () => {
    setBusy(true);
    try {
      const res = await authFetch("/master-charts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, mode: newMode }),
      });
      if (!res.ok) throw new Error("Create failed");
      const chart = (await res.json()) as ChartRow;
      await loadCharts();
      setSelectedId(chart.id);
      setAiCollapsed(false);
      setLayoutMode("split");
      toast({ title: "Dataset created" });
    } catch {
      toast({ title: "Create failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  /** Quick-create a new dataset with an auto-generated name — no form needed. */
  const handleQuickCreate = async () => {
    if (busy || streaming) return;
    setBusy(true);
    try {
      const autoName = `Dataset ${charts.length + 1}`;
      const res = await authFetch("/master-charts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: autoName, mode: "chat_to_excel" }),
      });
      if (!res.ok) throw new Error("Create failed");
      const chart = (await res.json()) as ChartRow;
      await loadCharts();
      setSelectedId(chart.id);
      setMessages([]);
      resetStream();
      setAiCollapsed(false);
      setLayoutMode("split");
      toast({ title: `Created "${autoName}"`, description: "Start typing to build your master chart." });
    } catch {
      toast({ title: "Create failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  /** Clear the current chat conversation without switching datasets. */
  const handleNewChat = () => {
    if (busy || streaming) return;
    setMessages([]);
    setLastPrompt(null);
    resetStream();
  };

  const handleGenerate = async (promptText: string) => {
    if (!selectedId || busy || streaming) return;
    setLastPrompt(promptText);

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: promptText,
      timestamp: Date.now(),
    };
    setMessages((m) => [...m, userMsg]);
    setBusy(true);
    // Only reset the text/thinking content — keep liveWorkbook so spreadsheet stays visible
    setVersionCache((prev) => {
      const next = { ...prev };
      delete next["_live" as unknown as number];
      return next;
    });

    // Stream buffer for accumulating assistant tokens
    let assistantBuffer = "";
    let assistantMsgId = uid();
    let committedThisRun = false;

    // Add placeholder assistant message
    setMessages((m) => [
      ...m,
      { id: assistantMsgId, role: "assistant", content: "", timestamp: Date.now() },
    ]);

    try {
      await streamSendMessage(
        workspaceId,
        selectedId,
        promptText,
        getToken,
        (event: DatasetChatStreamEvent) => {
          switch (event.type) {
            case "thinking":
              setStatusText("Agent thinking…");
              break;

            case "token":
              assistantBuffer += event.content;
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, content: assistantBuffer }
                    : msg,
                ),
              );
              break;

            case "sheet_updated": {
              // Live workbook update — reflect immediately in spreadsheet
              const newSpec = parseSheetSpec(event.workbook as unknown as Record<string, unknown>);
              const newCols = newSpec.columns?.map((c) => c.header) ?? [];
              const prevCols = activeSpec.columns?.map((c) => c.header) ?? [];
              const added = newCols.filter((h) => !prevCols.includes(h));
              if (added.length) {
                setHighlightHeaders(added);
                setTimeout(() => setHighlightHeaders([]), 4000);
              }
              setVersionCache((prev) => ({
                ...prev,
                _live: {
                  version: -1,
                  schemaJson: newSpec,
                  statsSummary: undefined,
                  vaultResourceId: undefined,
                },
              }));
              setStatusText(event.summary || "Spreadsheet updated");
              break;
            }

            case "tool_start":
              setStatusText(event.message);
              break;

            case "tool_done":
              if (event.ok) setStatusText(undefined);
              break;

            case "version_committed": {
              committedThisRun = true;
              const vNum = event.version;
              setCurrentVersion(vNum);
              setSelectedVersion(vNum);
              // Clear live preview
              setVersionCache((prev) => {
                const next = { ...prev };
                delete next["_live" as unknown as number];
                return next;
              });
              void loadDetail(selectedId).then(() => void loadCharts());
              toast({
                title: `Chart v${vNum} saved`,
                description: event.summary || (event.vaultResourceId ? "Saved to Research Vault." : undefined),
              });
              // Update the placeholder message with a version badge
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, version: vNum }
                    : msg,
                ),
              );
              break;
            }

            case "error": {
              const errMsg = event.message;
              if (committedThisRun) {
                // Chart was saved — show a non-fatal warning toast, don't mark message as error.
                toast({
                  title: "Chart saved with warnings",
                  description: "Your chart was committed successfully. Some follow-up steps did not complete.",
                });
              } else {
                setMessages((m) =>
                  m.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, content: `__error__${errMsg}` }
                      : msg,
                  ),
                );
                toast({ title: "Agent error", description: errMsg, variant: "destructive" });
              }
              break;
            }

            case "done": {
              // If no content accumulated, mark placeholder as done
              if (!assistantBuffer && !event.content) {
                setMessages((m) =>
                  m.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, content: "Done. Check the spreadsheet for any updates." }
                      : msg,
                  ),
                );
              }
              setLastPrompt(null);
              break;
            }
          }
        },
      );
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Agent failed";
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantMsgId
            ? { ...msg, content: `__error__${errorMsg}` }
            : msg,
        ),
      );
      toast({ title: "Generate failed", description: errorMsg, variant: "destructive" });
    } finally {
      setBusy(false);
      setStatusText(undefined);
    }
  };

  const handleUpload = async (file: File) => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/workspaces/${workspaceId}/master-charts/${selectedId}/upload`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        },
      );
      if (!res.ok) throw new Error("Upload failed");
      const json = await res.json();
      setMessages((m) => [
        ...m,
        {
          id: uid(),
          role: "assistant",
          content: buildAssistantReply(parseSheetSpec(json.schema), json.version),
          version: json.version,
          timestamp: Date.now(),
        },
      ]);
      await loadDetail(selectedId);
      await loadCharts();
      toast({
        title: "File uploaded",
        description: json.vaultResourceId ? "Mirrored to Research Vault." : undefined,
      });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleContextUpload = async (files: File[]) => {
    if (!selectedId || files.length === 0) return;
    const token = await getToken();
    const form = new FormData();
    for (const file of files) {
      form.append("files", file);
    }
    const res = await fetch(
      `/api/workspaces/${workspaceId}/master-charts/${selectedId}/context`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      },
    );
    if (!res.ok) {
      const errMsg = await safeErrorMessage(res);
      throw new Error(errMsg);
    }
    await loadDetail(selectedId);
    toast({
      title: files.length === 1 ? "Context file added" : `${files.length} files added`,
      description: "AI will read all uploaded content before generating.",
    });
  };

  const handleContextDelete = async (fileId: number) => {
    if (!selectedId) return;
    const res = await authFetch(`/master-charts/${selectedId}/context/${fileId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to remove file");
    await loadDetail(selectedId);
    toast({ title: "Context file removed" });
  };

  const handleDeleteVersion = async (version: number) => {
    if (!selectedId) return;
    if (!window.confirm(`Delete chart version v${version}? This cannot be undone.`)) return;
    setDeletingVersion(version);
    try {
      const res = await authFetch(`/master-charts/${selectedId}/versions/${version}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errMsg = await safeErrorMessage(res);
        throw new Error(errMsg);
      }
      const json = (await res.json()) as { currentVersion: number };
      setVersionCache((prev) => {
        const next = { ...prev };
        delete next[version];
        return next;
      });
      setCurrentVersion(json.currentVersion);
      setSelectedVersion(json.currentVersion || 1);
      await loadDetail(selectedId);
      await loadCharts();
      toast({ title: `Deleted v${version}` });
    } catch (e) {
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setDeletingVersion(null);
    }
  };

  const handleDownload = async (format: "xlsx" | "csv") => {
    if (!selectedId) return;
    try {
      const res = await authFetch(`/master-charts/${selectedId}/download?format=${format}`);
      if (!res.ok) throw new Error("Download unavailable");
      const { url } = (await res.json()) as { url: string };
      window.open(url, "_blank");
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const dismissGuide = () => {
    setGuideOpen(false);
    localStorage.setItem(GUIDE_DISMISS_KEY(workspaceId), "1");
  };

  const selectedChart = charts.find((c) => c.id === selectedId);

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled={busy} className="gap-1.5" onClick={() => fileRef.current?.click()}>
        <Upload className="w-3.5 h-3.5" /> Upload .xlsx
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={currentVersion === 0}
        onClick={() => void handleDownload("xlsx")}
        title="Download as Excel (.xlsx)"
      >
        <Download className="w-3.5 h-3.5" /> XLSX
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={currentVersion === 0}
        onClick={() => void handleDownload("csv")}
        title="Download as CSV"
      >
        CSV
      </Button>
      {activePreview?.vaultResourceId && (
        <Badge variant="outline" className="gap-1 text-green-700 border-green-200 bg-green-50">
          <Database className="w-3 h-3" /> Vault
        </Badge>
      )}
      <div className="ml-auto flex gap-1">
        {layoutMode !== "fullscreen" && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 hidden lg:flex"
            onClick={() => setLayoutMode("fullscreen")}
          >
            <Maximize2 className="w-3.5 h-3.5" /> Expand
          </Button>
        )}
        {layoutMode === "fullscreen" && (
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => setLayoutMode("split")}>
            <Minimize2 className="w-3.5 h-3.5" /> Exit fullscreen
          </Button>
        )}
      </div>
    </div>
  );

  const dataPane = (
    <div className="space-y-4 min-h-0 overflow-y-auto pr-1">
      {currentVersion > 0 && (
        <MasterChartVersionBar
          versions={versionMetas}
          selectedVersion={selectedVersion || currentVersion}
          currentVersion={currentVersion}
          deletingVersion={deletingVersion}
          onSelect={(v) => void loadVersion(v)}
          onDelete={(v) => void handleDeleteVersion(v)}
        />
      )}
      {toolbar}
      <MasterChartSpreadsheet spec={activeSpec} highlightHeaders={highlightHeaders} />
      <MasterChartStats statsSummary={activePreview?.statsSummary} />
    </div>
  );

  const aiPane = (
    <MasterChartAiAssistant
      messages={messages}
      busy={busy || streaming}
      statusText={toolStatus ?? (lastPingAt && streaming ? "Agent still working…" : statusText)}
      thinking={thinking}
      toolStatus={toolStatus}
      streaming={streaming}
      contextFiles={contextFiles}
      lastPrompt={lastPrompt}
      onSend={(text) => void handleGenerate(text)}
      onRetry={lastPrompt ? () => void handleGenerate(lastPrompt) : undefined}
      onAttachClick={handleDatasetAttachClick}
      onContextUpload={async (files) => {
        try {
          await handleContextUpload(files);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          toast({
            title: "Upload failed",
            description: msg.includes("Maximum 3")
              ? "Maximum 3 files — remove one first, then add the next batch."
              : msg,
            variant: "destructive",
          });
          throw err;
        }
      }}
      onContextDelete={handleContextDelete}
      onExpand={() => setLayoutMode("fullscreen")}
      onNewChat={handleNewChat}
      layoutCollapsed={aiCollapsed}
      onLayoutCollapsedChange={setAiCollapsed}
      className="h-full"
    />
  );

  const workspaceBody = selectedId ? (
    <>
      <div className="hidden lg:block h-[min(72vh,720px)]">
        {aiCollapsed ? (
          <div className="space-y-4">
            {dataPane}
            {aiPane}
          </div>
        ) : (
          <ResizablePanelGroup direction="horizontal" className="h-full rounded-xl border">
            <ResizablePanel defaultSize={62} minSize={35}>
              <div className="h-full overflow-y-auto p-4">{dataPane}</div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={38} minSize={28}>
              <div className="h-full p-4 pl-0">{aiPane}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
      <div className="lg:hidden space-y-4">
        {dataPane}
        <Button
          className="fixed bottom-6 right-6 z-40 shadow-lg gap-2 rounded-full h-12 px-5"
          onClick={() => setMobileAiOpen(true)}
        >
          <Sparkles className="w-4 h-4" />
          AI Builder
        </Button>
        <Sheet open={mobileAiOpen} onOpenChange={setMobileAiOpen}>
          <SheetContent side="bottom" className="h-[88vh] p-0 flex flex-col">
            <SheetHeader className="px-4 pt-4 pb-2 shrink-0">
              <SheetTitle>AI Dataset Builder</SheetTitle>
            </SheetHeader>
            <div className="flex-1 min-h-0 px-4 pb-4">{aiPane}</div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  ) : null;

  useEffect(() => {
    return () => {
      if (visionHighlightTimerRef.current) clearTimeout(visionHighlightTimerRef.current);
    };
  }, []);

  const handleDatasetAttachClick = useCallback(() => {
    toast({
      title: "Tip: use quaasx-vision-reader",
      description:
        "For PDFs and scanned forms, quaasx-vision-reader reads up to 10 files in full detail. " +
        "Sync to Dataset AI automatically (toggle) or with Send to Dataset AI. " +
        "You can still attach up to 3 files here for quick context.",
      duration: 9000,
    });

    setVisionTabHighlight(true);
    if (visionHighlightTimerRef.current) clearTimeout(visionHighlightTimerRef.current);
    visionHighlightTimerRef.current = setTimeout(() => setVisionTabHighlight(false), 8000);

    requestAnimationFrame(() => {
      panelTabsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [toast]);

  // ── Vision Reader sync callback ────────────────────────────────────────────
  const handleVisionSendToDataset = useCallback((text: string) => {
    setPanelTab("dataset");
    // Small delay so the tab switch renders before we fire the message
    setTimeout(() => void handleGenerate(text), 80);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const innerContent = (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── Panel sub-tabs ─────────────────────────────────────────────────── */}
      <div
        ref={panelTabsRef}
        className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl border border-border/40 w-fit scroll-mt-24"
      >
        <button
          type="button"
          onClick={() => setPanelTab("dataset")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
            panelTab === "dataset"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Database className="w-3.5 h-3.5" />
          Dataset Builder
        </button>
        <button
          type="button"
          id="quaasx-vision-reader-tab"
          onClick={() => setPanelTab("vision")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
            panelTab === "vision"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground",
            visionTabHighlight &&
              "ring-2 ring-blue-500 ring-offset-2 border-blue-400/80 bg-blue-50 text-blue-900 shadow-[0_0_18px_rgba(59,130,246,0.45)] animate-pulse",
          )}
        >
          <Eye className={cn("w-3.5 h-3.5", visionTabHighlight && "text-blue-600")} />
          quaasx-vision-reader
        </button>
      </div>

      {/* ── Vision Reader panel ──────────────────────────────────────────────── */}
      {panelTab === "vision" ? (
        <VisionReaderPanel
          workspaceId={workspaceId}
          onSendToDataset={selectedId ? handleVisionSendToDataset : undefined}
        />
      ) : (
      <>
      {guideOpen && (
        <div className="p-5 border border-violet-200 bg-violet-50/80 rounded-xl space-y-4 relative">
          <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-8 w-8" onClick={dismissGuide}>
            <X className="w-4 h-4" />
          </Button>
          <div className="flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-violet-700 mt-0.5 shrink-0" />
            <div className="space-y-3 text-sm text-violet-900">
              <p className="font-serif font-semibold text-base">
                Why build your Master Chart before writing thesis sections?
              </p>
              <p>
                Your locked pre-thesis defines structure and methods. The master chart turns that
                design into a real data schema so Results and Statistics stay protocol-consistent.
              </p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Create a dataset template or upload an existing spreadsheet.</li>
                <li>Upload PDFs, DOCX, or images for OCR context.</li>
                <li>Chat with AI to generate or refine the Excel master chart.</li>
                <li>Download XLSX/CSV — artifacts auto-save to Research Vault.</li>
              </ol>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleCreate} disabled={busy}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Create template
            </Button>
            <Button size="sm" variant="ghost" onClick={dismissGuide}>
              Got it — start building
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1 flex-1 min-w-[200px]">
          <Label>Name</Label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <div className="space-y-1 w-48">
          <Label>Mode</Label>
          <Select value={newMode} onValueChange={setNewMode}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="chat_to_excel">Chat to Excel</SelectItem>
              <SelectItem value="upload_modify">Upload & modify</SelectItem>
              <SelectItem value="auto_from_methods">Auto from Methods</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleCreate} disabled={busy} className="gap-2">
          <Plus className="w-4 h-4" /> New dataset
        </Button>
      </div>

      {charts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {charts.map((c) => (
            <Button
              key={c.id}
              variant={selectedId === c.id ? "default" : "outline"}
              size="sm"
              className={cn(
                "gap-1.5 h-8 text-xs",
                selectedId === c.id && "shadow-sm",
              )}
              onClick={() => setSelectedId(c.id)}
            >
              <Table2 className="w-3 h-3" />
              <span className="max-w-[120px] truncate">{c.name}</span>
              <Badge
                variant={selectedId === c.id ? "secondary" : "outline"}
                className="text-[10px] h-4 px-1 ml-0.5"
              >
                v{c.currentVersion}
              </Badge>
            </Button>
          ))}
          {/* Quick-create new dataset */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 rounded-lg border-dashed hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
            onClick={() => void handleQuickCreate()}
            disabled={busy || streaming}
            title="New dataset"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {workspaceBody}

      {charts.length === 0 && (
        <div className="flex flex-col items-center text-center space-y-4 py-12 px-6 border border-dashed rounded-xl bg-muted/10">
          <Database className="w-10 h-10 text-muted-foreground/30" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">No datasets yet</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Build your master chart before writing thesis sections. Upload context files (PDF, images, DOCX) and let AI create the perfect data schema.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            <Button size="sm" onClick={handleCreate} disabled={busy} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Create dataset
            </Button>
            <Button size="sm" variant="outline" onClick={() => setGuideOpen(true)} className="gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> How it works
            </Button>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!gated) {
    return (
      <div className="p-6 border border-dashed rounded-xl text-center text-sm text-muted-foreground">
        Complete Pre-Thesis Setup and lock-in to use the Dataset builder.
      </div>
    );
  }

  if (layoutMode === "fullscreen") {
    return createPortal(
      <div className="fixed inset-0 z-50 bg-background flex flex-col animate-in fade-in duration-200">
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLayoutMode("split")}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div className="flex-1 min-w-0">
            <p className="font-serif font-semibold truncate">
              {selectedChart?.name ?? "Dataset"} v{selectedVersion || currentVersion}
            </p>
            <p className="text-xs text-muted-foreground">
              {workbookSheets.length > 1 ? `${workbookSheets.length} sheets · ` : ""}
              {totalCols} columns · {totalRows} rows
            </p>
          </div>
          {toolbar}
        </div>
        <div className="flex-1 min-h-0 p-4">
          {aiCollapsed ? (
            <div className="h-full space-y-4 overflow-y-auto">{dataPane}{aiPane}</div>
          ) : (
            <ResizablePanelGroup direction="horizontal" className="h-full">
              <ResizablePanel defaultSize={65} minSize={40}>
                <div className="h-full overflow-y-auto pr-2">{dataPane}</div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={35} minSize={25}>
                <div className="h-full pl-2">{aiPane}</div>
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>
      </div>,
      document.body,
    );
  }

  return innerContent;
}
