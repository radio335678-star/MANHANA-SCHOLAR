import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  useGetWorkspace,
  useListSections,
  useUpdateSection,
  useListChatMessages,
  useCreateSection,
  useDeleteSection,
  useReorderSections,
  getGetWorkspaceQueryKey,
  getListSectionsQueryKey,
  getListChatMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

import { ThesisPreview } from "@/components/editor/ThesisPreview";
import { AutoCompleteDialog } from "@/components/editor/AutoCompleteDialog";
import type { Editor } from "@tiptap/react";
import { markdownToHtml } from "@/lib/markdownToHtml";
import { expandVaultCitationsInText, type VaultCitationCatalog } from "@workspace/vault-citations";
import { useVaultCitationCatalog } from "@/hooks/useVaultCitationCatalog";
import { VaultEvidenceBar } from "@/components/editor/VaultEvidenceBar";
import { CitedMessageContent } from "@/components/editor/CitedMessageContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ArrowLeft,
  MessageSquare,
  Save,
  Plus,
  FileText,
  CheckCircle2,
  Circle,
  GripVertical,
  Wand2,
  Trash2,
  X,
  ChevronDown,
  Download,
  Sparkles,
  Send,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
  FileDown,
  Paperclip,
  Brain,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SidebarTrigger } from "@/components/ui/sidebar";

import { inferSectionType, getPageSpecForTitle } from "@/lib/standardSections";

const QUICK_PROMPTS = [
  "Add citations from vault sources",
  "Expand with recent 2024-2026 studies",
  "Add statistical analysis",
  "Generate bibliography for this section",
  "Make the language more formal",
  "Ensure coherence with adjacent sections",
];

type StreamingState = {
  isStreaming: boolean;
  content: string;
};

const SECTIONS_COLLAPSED_KEY = "sections-sidebar-collapsed";

// Sortable Section Item
function SortableSection({
  section,
  isActive,
  onClick,
  onDelete,
  onUpdatePages,
  collapsed = false,
}: {
  section: any;
  isActive: boolean;
  onClick: () => void;
  onDelete: (id: number) => void;
  onUpdatePages: (id: number, targetPages: number) => void;
  collapsed?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const statusColor: Record<string, string> = {
    completed: "bg-primary",
    in_progress: "bg-amber-500",
    not_started: "bg-muted-foreground/20",
    reviewed: "bg-green-500",
  };

  if (collapsed) {
    return (
      <div ref={setNodeRef} style={style}>
        <button
          onClick={onClick}
          title={section.title}
          className={cn(
            "w-full flex justify-center py-2 rounded-md transition-colors",
            isActive ? "bg-primary/15 ring-1 ring-primary/30" : "hover:bg-muted/50"
          )}
        >
          <div className={cn("w-2.5 h-2.5 rounded-full", statusColor[section.status] ?? "bg-muted")} />
        </button>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <button
        onClick={onClick}
        className={cn(
          "w-full text-left px-2 py-2 text-sm rounded-md transition-colors flex items-center gap-2",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </span>
        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusColor[section.status] ?? "bg-muted")} />
        <span className="truncate flex-1">{section.title}</span>
        {section.wordCount > 0 && (
          <span className="text-xs text-muted-foreground/60 shrink-0">{section.wordCount}w</span>
        )}
      </button>
      {!collapsed && (
        <div className="px-2 pb-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="shrink-0 tabular-nums">
            {section.minPages ?? 1}–{section.maxPages ?? "?"} pg
          </span>
          <Input
            type="number"
            min={section.minPages ?? 1}
            max={section.maxPages ?? 500}
            value={section.targetPages ?? ""}
            placeholder="target"
            className="h-6 text-[10px] px-1.5 w-14"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) onUpdatePages(section.id, v);
            }}
          />
        </div>
      )}
      <button
        className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 hover:text-destructive"
        onClick={(e) => { e.stopPropagation(); onDelete(section.id); }}
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function WorkspaceEditor({ id }: { id: string }) {
  const workspaceId = parseInt(id, 10);
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [manualEdit, setManualEdit] = useState(false);
  const [autoCompleteOpen, setAutoCompleteOpen] = useState(false);
  const [thinkingContent, setThinkingContent] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string }>>([]);
  const [coherenceScore, setCoherenceScore] = useState<number | null>(null);
  const [previewStreamContent, setPreviewStreamContent] = useState("");

  const [sectionsCollapsed, setSectionsCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SECTIONS_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  const toggleSectionsCollapsed = () => {
    setSectionsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SECTIONS_COLLAPSED_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const searchParams = new URLSearchParams(window.location.search);
  const [activeSectionId, setActiveSectionId] = useState<number | null>(
    searchParams.get("section") ? parseInt(searchParams.get("section")!, 10) : null
  );

  const { data: workspace } = useGetWorkspace(workspaceId, {
    query: { enabled: !!workspaceId, queryKey: getGetWorkspaceQueryKey(workspaceId) },
  });

  const workflowState =
    (workspace as { workflowState?: string } | undefined)?.workflowState ?? "init";
  const aiWritingAllowed =
    ["locked_in", "section_build", "review", "complete"].includes(workflowState) &&
    Boolean((workspace as { preThesisMdHash?: string | null })?.preThesisMdHash);

  const { data: sections, isLoading: isSectionsLoading } = useListSections(workspaceId, {
    query: { enabled: !!workspaceId, queryKey: getListSectionsQueryKey(workspaceId) },
  });

  useEffect(() => {
    if (sections && sections.length > 0 && !activeSectionId) {
      setActiveSectionId(sections[0].id);
    }
  }, [sections, activeSectionId]);

  useEffect(() => {
    if (!workspaceId || !aiWritingAllowed || isSectionsLoading) return;
    if (sections && sections.length > 0) return;

    getToken().then(async (token) => {
      await fetch(`/api/workspaces/${workspaceId}/sections/scaffold`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      queryClient.invalidateQueries({ queryKey: getListSectionsQueryKey(workspaceId) });
    });
  }, [workspaceId, aiWritingAllowed, isSectionsLoading, sections, getToken, queryClient]);

  useEffect(() => {
    if (!workspaceId || !aiWritingAllowed) return;
    getToken().then(async (token) => {
      const res = await fetch(`/api/workspaces/${workspaceId}/sections/coherence`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCoherenceScore(data.score ?? null);
      }
    });
  }, [workspaceId, aiWritingAllowed, sections, getToken]);

  const activeSection = sections?.find((s) => s.id === activeSectionId);

  // Editor content state
  const [editorHtml, setEditorHtml] = useState("");
  const [editorText, setEditorText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [autoSaveTimer, setAutoSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const updateSection = useUpdateSection();

  useEffect(() => {
    if (activeSection) {
      setEditorHtml(activeSection.content ?? "");
    }
  }, [activeSectionId, activeSection?.id]);

  const handleEditorChange = useCallback(
    (html: string, text: string) => {
      setEditorHtml(html);
      setEditorText(text);
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      const timer = setTimeout(() => {
        if (!activeSection) return;
        const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
        updateSection.mutate({
          workspaceId,
          sectionId: activeSection.id,
          data: { content: html },
        });
      }, 3000);
      setAutoSaveTimer(timer);
    },
    [activeSection, workspaceId, autoSaveTimer]
  );

  const handleSave = () => {
    if (!activeSection) return;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    setIsSaving(true);
    const wordCount = editorText.trim().split(/\s+/).filter(Boolean).length;
    updateSection.mutate(
      { workspaceId, sectionId: activeSection.id, data: { content: editorHtml } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSectionsQueryKey(workspaceId) });
          toast({ title: "Saved" });
        },
        onSettled: () => setIsSaving(false),
      }
    );
  };

  const handleStatusToggle = () => {
    if (!activeSection) return;
    const next = activeSection.status === "completed" ? "in_progress" : "completed";
    updateSection.mutate(
      { workspaceId, sectionId: activeSection.id, data: { status: next } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSectionsQueryKey(workspaceId) }) }
    );
  };

  // Section creation
  const createSection = useCreateSection();
  const deleteSection = useDeleteSection();
  const reorderSections = useReorderSections();
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleCreateSection = (title?: string) => {
    const t = title ?? newSectionTitle;
    if (!t.trim()) return;
    const pages = getPageSpecForTitle(t);
    createSection.mutate(
      {
        workspaceId,
        data: {
          title: t,
          type: inferSectionType(t),
          status: "not_started",
          targetPages: pages.targetPages,
          minPages: pages.minPages,
          maxPages: pages.maxPages,
        },
      },
      {
        onSuccess: (newSec) => {
          queryClient.invalidateQueries({ queryKey: getListSectionsQueryKey(workspaceId) });
          setActiveSectionId(newSec.id);
          setIsDialogOpen(false);
          setNewSectionTitle("");
        },
      }
    );
  };

  const handleDeleteSection = (sectionId: number) => {
    if (!confirm("Delete this section?")) return;
    deleteSection.mutate(
      { workspaceId, sectionId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSectionsQueryKey(workspaceId) });
          if (activeSectionId === sectionId) setActiveSectionId(null);
        },
      }
    );
  };

  const handleUpdatePages = (sectionId: number, targetPages: number) => {
    updateSection.mutate(
      { workspaceId, sectionId, data: { targetPages } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSectionsQueryKey(workspaceId) }) },
    );
  };

  const handleFileUpload = async (file: File) => {
    if (!activeSectionId) return;
    const token = await getToken();
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(
      `/api/workspaces/${workspaceId}/sections/${activeSectionId}/chat/upload`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
    );
    if (res.ok) {
      const data = await res.json();
      setUploadedFiles((prev) => [...prev, { name: data.fileName ?? file.name }]);
      toast({ title: "File attached", description: file.name });
    }
  };

  // DnD reordering
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !sections) return;
    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...sections];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    const orderedIds = reordered.map((s) => s.id);
    reorderSections.mutate(
      { workspaceId, data: { orderedIds } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSectionsQueryKey(workspaceId) }) }
    );
  };

  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(true);
  const [localMessages, setLocalMessages] = useState<Array<{ role: string; content: string; id: string }>>([]);
  const [chatStreaming, setChatStreaming] = useState<StreamingState>({ isStreaming: false, content: "" });
  const [lastUnknownKeys, setLastUnknownKeys] = useState<string[]>([]);
  const [sseCatalog, setSseCatalog] = useState<VaultCitationCatalog>({});

  const { catalog: vaultCatalog, entries: vaultEntries, resourceCount: vaultResourceCount } =
    useVaultCitationCatalog(workspaceId);

  const mergedCatalog: VaultCitationCatalog = { ...vaultCatalog, ...sseCatalog };

  const { data: serverMessages } = useListChatMessages(workspaceId, activeSectionId ?? 0, {
    query: {
      enabled: !!activeSectionId,
      queryKey: getListChatMessagesQueryKey(workspaceId, activeSectionId ?? 0),
    },
  });

  useEffect(() => {
    if (serverMessages) {
      setLocalMessages(
        serverMessages.map((m) => ({ role: m.role, content: m.content, id: String(m.id) }))
      );
    }
  }, [serverMessages]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [localMessages, chatStreaming.content]);

  const handleChatSubmit = async (message?: string) => {
    const text = message ?? chatInput;
    if (!text.trim() || !activeSectionId || chatStreaming.isStreaming) return;
    if (!aiWritingAllowed) {
      toast({
        title: "Pre-thesis lock-in required",
        description: "Complete Pre-Thesis Setup and lock-in before using AI chat.",
        variant: "destructive",
      });
      return;
    }
    setChatInput("");
    setThinkingContent("");
    setPreviewStreamContent("");

    const userMsg = { role: "user", content: text, id: `user-${Date.now()}` };
    setLocalMessages((prev) => [...prev, userMsg]);
    setChatStreaming({ isStreaming: true, content: "" });

    try {
      const token = await getToken();
      abortRef.current = new AbortController();

      const res = await fetch(
        `/api/workspaces/${workspaceId}/sections/${activeSectionId}/chat/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: text, includeContext: true }),
          signal: abortRef.current.signal,
        }
      );

      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "token") {
              fullContent += data.content;
              setChatStreaming({ isStreaming: true, content: fullContent });
              setPreviewStreamContent(fullContent);
            } else if (data.type === "thinking") {
              setThinkingContent((prev) => (prev + data.content).slice(-2000));
            } else if (data.type === "section_updated") {
              const html = markdownToHtml(data.content);
              setEditorHtml(html);
              setPreviewStreamContent(data.content);
              editorRef.current?.commands.setContent(html);
            } else if (data.type === "done") {
              const content = data.content ?? fullContent;
              if (content && !manualEdit) {
                applyContentToEditor(content, "replace", true);
              }
              setPreviewStreamContent("");
              if (data.unknownKeys?.length) setLastUnknownKeys(data.unknownKeys);
              else setLastUnknownKeys([]);
              if (data.vaultCatalog?.length) {
                const next: VaultCitationCatalog = {};
                for (const e of data.vaultCatalog) next[e.key] = e;
                setSseCatalog(next);
              }
              const assistantMsg = { role: "assistant", content, id: `ai-${Date.now()}` };
              setLocalMessages((prev) => [...prev, assistantMsg]);
              setChatStreaming({ isStreaming: false, content: "" });
              queryClient.invalidateQueries({ queryKey: getListChatMessagesQueryKey(workspaceId, activeSectionId) });
              if (data.unknownKeys?.length) {
                toast({
                  title: "Unverified citations detected",
                  description: `Keys not in vault: ${data.unknownKeys.join(", ")}`,
                  variant: "destructive",
                });
              }
            } else if (data.type === "error") {
              setChatStreaming({ isStreaming: false, content: "" });
              toast({ title: data.message, variant: "destructive" });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setChatStreaming({ isStreaming: false, content: "" });
        toast({ title: "Chat request failed", variant: "destructive" });
      }
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setChatStreaming({ isStreaming: false, content: "" });
  };

  const applyContentToEditor = useCallback(
    (text: string, mode: "replace" | "append" = "replace", expandCitations = true) => {
      const prose = expandCitations ? expandVaultCitationsInText(text, mergedCatalog) : text;
      const html = markdownToHtml(prose);
      const editor = editorRef.current;

      if (editor) {
        if (mode === "replace") {
          editor.commands.setContent(html);
        } else {
          editor.commands.insertContentAt(editor.state.doc.content.size, html);
        }
        setEditorHtml(editor.getHTML());
        setEditorText(editor.getText());
      } else {
        setEditorHtml(html);
        setEditorText(prose.replace(/<[^>]+>/g, " "));
      }

      toast({
        title: "Applied to document",
        description: expandCitations
          ? "Vault citations expanded to author–year in the thesis."
          : "Content inserted with [Vn] citation keys.",
      });
    },
    [toast, mergedCatalog]
  );

  // Section generation SSE
  const [generating, setGenerating] = useState(false);
  const [generatingContent, setGeneratingContent] = useState("");

  const handleGenerate = async () => {
    if (!activeSection || generating) return;
    if (!aiWritingAllowed) {
      toast({
        title: "Pre-thesis lock-in required",
        description: "Complete Pre-Thesis Setup and lock-in before using AI generation.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    setGeneratingContent("");
    let accumulated = "";

    try {
      const token = await getToken();
      const res = await fetch(
        `/api/workspaces/${workspaceId}/sections/${activeSectionId}/generate/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            prompt:
              vaultResourceCount > 0
                ? `Write a comprehensive, scholarly ${activeSection.title} section for this thesis. Support claims only with Research Vault sources using inline keys [V1], [V2], etc. End with a "References (Research Vault)" block listing every cited key.`
                : `Write a comprehensive ${activeSection.title} section. The Research Vault is empty — do not invent citations; note where literature from the vault is needed.`,
            wordLimit: 1500,
          }),
        }
      );

      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "token") {
              accumulated += data.content;
              setGeneratingContent(accumulated);
            } else if (data.type === "done") {
              const raw = data.content ?? accumulated;
              if (data.unknownKeys?.length) {
                setLastUnknownKeys(data.unknownKeys);
                toast({
                  title: "Unverified citations in draft",
                  description: `Keys not in vault: ${data.unknownKeys.join(", ")}`,
                  variant: "destructive",
                });
              } else {
                setLastUnknownKeys([]);
              }
              if (data.vaultCatalog?.length) {
                const next: VaultCitationCatalog = {};
                for (const e of data.vaultCatalog) next[e.key] = e;
                setSseCatalog(next);
              }
              const html = markdownToHtml(raw);
              setEditorHtml(html);
              editorRef.current?.commands.setContent(html);
              if (editorRef.current) {
                setEditorText(editorRef.current.getText());
              }
              queryClient.invalidateQueries({ queryKey: getListSectionsQueryKey(workspaceId) });
              toast({
                title: "Section generated",
                description:
                  vaultResourceCount > 0
                    ? `${activeSection.title} drafted with vault citation keys [Vn].`
                    : `${activeSection.title} drafted — add vault sources for citations.`,
              });
            } else if (data.type === "error") {
              toast({ title: "Generation failed", variant: "destructive" });
            }
          } catch {}
        }
      }
    } catch {
      toast({ title: "Generation failed", variant: "destructive" });
    } finally {
      setGenerating(false);
      setGeneratingContent("");
    }
  };

  // DOCX export
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/workspaces/${workspaceId}/export/docx`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${workspace?.title ?? "thesis"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Thesis exported", description: "DOCX downloaded successfully." });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const wordCount = editorText.trim().split(/\s+/).filter(Boolean).length;
  const estPages = Math.ceil(wordCount / 250);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background overflow-hidden">
      {/* Top Bar */}
      <div className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0 bg-card">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-1 h-8 w-8 shrink-0 md:hidden" />
          <Link href={`/workspaces/${workspaceId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <span className="font-serif font-medium text-sm truncate max-w-xs text-foreground">
            {workspace?.title}
          </span>
          {workspace?.domain && (
            <Badge variant="secondary" className="text-xs">{workspace.domain}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeSection && (
            <>
              <span className="text-xs text-muted-foreground hidden sm:block">
                {wordCount} words · ~{estPages} pages
              </span>
              <Button
                variant={activeSection.status === "completed" ? "default" : "outline"}
                size="sm"
                onClick={handleStatusToggle}
                className="h-7 text-xs gap-1"
              >
                {activeSection.status === "completed" ? (
                  <><CheckCircle2 className="w-3 h-3" /> Done</>
                ) : (
                  <><Circle className="w-3 h-3" /> Mark Done</>
                )}
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            Export DOCX
          </Button>
          {aiWritingAllowed && (
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setAutoCompleteOpen(true)}
            >
              <Sparkles className="w-3 h-3" />
              Auto Complete Thesis
            </Button>
          )}
        </div>
      </div>

      {!aiWritingAllowed && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2 shrink-0">
          <span>AI writing is locked until you complete Pre-Thesis Setup and lock-in.</span>
          <Link href={`/workspaces/${workspaceId}`}>
            <Button variant="outline" size="sm" className="h-7 text-xs shrink-0">
              Go to Pre-Thesis
            </Button>
          </Link>
        </div>
      )}

      {aiWritingAllowed && (
        <VaultEvidenceBar
          workspaceId={workspaceId}
          resourceCount={vaultResourceCount}
          catalog={vaultEntries}
          unknownKeys={lastUnknownKeys}
        />
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Sections */}
        <div
          className={cn(
            "border-r border-border bg-card/50 flex flex-col shrink-0 transition-all duration-200",
            sectionsCollapsed ? "w-10" : "w-56"
          )}
        >
          <div className={cn("border-b border-border flex items-center", sectionsCollapsed ? "p-2 justify-center" : "p-3 justify-between")}>
            {!sectionsCollapsed && (
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sections</span>
            )}
            <div className={cn("flex items-center gap-1", sectionsCollapsed && "flex-col")}>
              {!sectionsCollapsed && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsDialogOpen(true)}
                title="Add custom section"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={toggleSectionsCollapsed}
                title={sectionsCollapsed ? "Expand sections" : "Collapse sections"}
              >
                {sectionsCollapsed ? (
                  <PanelLeftOpen className="w-3.5 h-3.5" />
                ) : (
                  <PanelLeftClose className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>

          <ScrollArea className={cn("flex-1 py-2", sectionsCollapsed ? "px-1" : "px-2")}>
            {isSectionsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : sections && sections.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToVerticalAxis]}
              >
                <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-0.5">
                    {sections.map((section) => (
                      <SortableSection
                        key={section.id}
                        section={section}
                        isActive={activeSectionId === section.id}
                        onClick={() => setActiveSectionId(section.id)}
                        onDelete={handleDeleteSection}
                        onUpdatePages={handleUpdatePages}
                        collapsed={sectionsCollapsed}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No sections yet</p>
                <p className="mt-1">Use + to add sections</p>
              </div>
            )}
          </ScrollArea>

          {/* Progress Footer */}
          {sections && sections.length > 0 && !sectionsCollapsed && (
            <div className="p-3 border-t border-border text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>
                  {sections.filter((s) => s.status === "completed").length}/{sections.length} done
                </span>
                <span>
                  {sections.reduce((acc, s) => acc + (s.wordCount ?? 0), 0).toLocaleString()} words
                </span>
              </div>
              <div className="h-1 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{
                    width: `${Math.round(
                      (sections.filter((s) => s.status === "completed").length / sections.length) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Center - Word Preview / Manual Edit */}
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          {activeSection ? (
            <>
              <div className="px-6 py-2 border-b border-border shrink-0 flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerate}
                  disabled={generating || !aiWritingAllowed}
                  className="gap-1.5 text-xs h-8 border-primary/20 text-primary hover:bg-primary/5"
                >
                  {generating ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5" /> Generate with AI</>
                  )}
                </Button>
              </div>
              <div className="flex-1 overflow-hidden relative">
                {generating ? (
                  <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">AI is generating {activeSection.title}…</p>
                    {generatingContent && (
                      <div className="max-w-lg px-6 text-sm text-foreground/80 text-center max-h-40 overflow-hidden">
                        {generatingContent.slice(-300)}
                      </div>
                    )}
                  </div>
                ) : null}
                <ThesisPreview
                  sectionTitle={activeSection.title}
                  sectionType={activeSection.type}
                  htmlContent={editorHtml}
                  workspaceTitle={workspace?.title}
                  qualification={workspace?.qualification ?? undefined}
                  catalog={mergedCatalog}
                  manualEdit={manualEdit}
                  onToggleManualEdit={() => setManualEdit((m) => !m)}
                  onChange={handleEditorChange}
                  onEditorReady={(ed) => { editorRef.current = ed; }}
                  streamingContent={previewStreamContent || generatingContent}
                  isStreaming={chatStreaming.isStreaming || generating}
                  className="h-full"
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-3">
              <FileText className="w-10 h-10 opacity-20" />
              <p className="text-sm">Select or create a section to start writing</p>
              <Button size="sm" variant="outline" onClick={() => setIsDialogOpen(true)} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add First Section
              </Button>
            </div>
          )}
        </div>

        {/* Right Sidebar - AI Chat */}
        <div
          className={cn(
            "border-l border-border bg-muted/10 flex flex-col shrink-0 transition-all",
            chatOpen ? (sectionsCollapsed ? "w-96" : "w-80") : "w-10"
          )}
        >
          <div
            className="p-3 border-b border-border flex items-center justify-between bg-card cursor-pointer"
            onClick={() => setChatOpen((o) => !o)}
          >
            {chatOpen ? (
              <>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">AI Assistant</span>
                  {coherenceScore != null && (
                    <Badge variant="outline" className="text-[10px] h-5">
                      Coherence {coherenceScore}%
                    </Badge>
                  )}
                </div>
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </>
            ) : (
              <MessageSquare className="w-4 h-4 text-primary mx-auto" />
            )}
          </div>

          {chatOpen && (
            <>
              {/* Quick Prompts */}
              {activeSectionId && (
                <div className="p-2 border-b border-border flex flex-wrap gap-1">
                  {QUICK_PROMPTS.slice(0, 4).map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleChatSubmit(prompt)}
                      disabled={chatStreaming.isStreaming}
                      className="text-xs px-2 py-1 rounded-full bg-secondary hover:bg-primary/10 hover:text-primary transition-colors text-muted-foreground border border-border"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {thinkingContent && (
                <details className="mx-3 mt-2 rounded border border-border bg-muted/30 p-2 text-[10px]">
                  <summary className="cursor-pointer flex items-center gap-1 font-medium text-muted-foreground">
                    <Brain className="w-3 h-3" /> AI Thinking
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground max-h-24 overflow-y-auto">
                    {thinkingContent}
                  </p>
                </details>
              )}

              {uploadedFiles.length > 0 && (
                <div className="px-3 pt-2 flex flex-wrap gap-1">
                  {uploadedFiles.map((f) => (
                    <Badge key={f.name} variant="secondary" className="text-[10px]">
                      {f.name}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Messages */}
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
                {!activeSectionId ? (
                  <p className="text-xs text-center text-muted-foreground pt-8">
                    Select a section to start chatting with the AI.
                  </p>
                ) : localMessages.length === 0 && !chatStreaming.isStreaming ? (
                  <div className="pt-8 text-center space-y-2">
                    <Wand2 className="w-8 h-8 mx-auto text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">Ask the AI for help with {activeSection?.title}</p>
                  </div>
                ) : (
                  localMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn("flex flex-col gap-1", msg.role === "user" ? "items-end" : "items-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[95%] px-3 py-2 rounded-lg text-xs leading-relaxed whitespace-pre-wrap",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-tr-none"
                            : "bg-card border border-border text-foreground rounded-tl-none"
                        )}
                      >
                        {msg.role === "assistant" ? (
                          <CitedMessageContent content={msg.content} catalog={mergedCatalog} />
                        ) : (
                          msg.content
                        )}
                      </div>
                      {msg.role === "assistant" && (
                        <div className="flex flex-wrap gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] gap-1 px-2 border-primary/20 text-primary hover:bg-primary/5"
                            onClick={() => applyContentToEditor(msg.content, "replace", true)}
                          >
                            <FileDown className="w-3 h-3" />
                            Apply (author–year)
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => applyContentToEditor(msg.content, "append", true)}
                          >
                            Append
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => applyContentToEditor(msg.content, "replace", false)}
                          >
                            Keep [Vn] keys
                          </Button>
                        </div>
                      )}
                    </div>
                  ))
                )}

                {chatStreaming.isStreaming && chatStreaming.content && (
                  <div className="flex flex-col items-start gap-1">
                    <div className="max-w-[95%] px-3 py-2 rounded-lg text-xs leading-relaxed bg-card border border-border text-foreground rounded-tl-none whitespace-pre-wrap">
                      <CitedMessageContent content={chatStreaming.content} catalog={mergedCatalog} />
                      <span className="inline-block w-1 h-3 bg-primary animate-pulse ml-0.5 align-middle" />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] gap-1 px-2 border-primary/20 text-primary hover:bg-primary/5"
                      onClick={() => applyContentToEditor(chatStreaming.content, "replace", true)}
                    >
                      <FileDown className="w-3 h-3" />
                      Apply (author–year)
                    </Button>
                  </div>
                )}

                {chatStreaming.isStreaming && !chatStreaming.content && (
                  <div className="flex items-start">
                    <div className="px-3 py-2 rounded-lg bg-card border border-border rounded-tl-none">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <div className="p-3 border-t border-border bg-card">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f);
                    e.target.value = "";
                  }}
                />
                <div className="flex gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 shrink-0 self-end"
                    disabled={!activeSectionId}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </Button>
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSubmit();
                      }
                    }}
                    placeholder={activeSectionId ? "Ask for help… (Enter to send)" : "Select a section first"}
                    disabled={!activeSectionId || chatStreaming.isStreaming || !aiWritingAllowed}
                    rows={2}
                    className="flex-1 resize-none text-xs bg-background border border-border rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                  {chatStreaming.isStreaming ? (
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-9 w-9 shrink-0 self-end"
                      onClick={stopStreaming}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      className="h-9 w-9 shrink-0 self-end"
                      onClick={() => handleChatSubmit()}
                      disabled={!activeSectionId || !chatInput.trim()}
                    >
                      <Send className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Custom Section Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
              placeholder="e.g., Pilot Study, Preliminary Observations"
              onKeyDown={(e) => e.key === "Enter" && handleCreateSection()}
            />
            <Button
              onClick={() => handleCreateSection()}
              disabled={!newSectionTitle.trim() || createSection.isPending}
              className="w-full"
            >
              {createSection.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Section
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AutoCompleteDialog
        open={autoCompleteOpen}
        onOpenChange={setAutoCompleteOpen}
        workspaceId={workspaceId}
        workspaceTitle={workspace?.title ?? "Thesis"}
        catalog={mergedCatalog}
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: getListSectionsQueryKey(workspaceId) });
        }}
      />
    </div>
  );
}
