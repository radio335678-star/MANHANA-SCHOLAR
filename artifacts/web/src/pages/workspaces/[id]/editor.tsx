import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { useAuth } from "@clerk/react";
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

import TiptapEditor from "@/components/editor/TiptapEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Standard thesis sections
const STANDARD_SECTIONS = [
  "Title Page",
  "Certificate",
  "Declaration",
  "Acknowledgements",
  "Abstract",
  "List of Abbreviations",
  "Introduction",
  "Aims & Objectives",
  "Review of Literature",
  "Materials & Methods",
  "Observations & Results",
  "Discussion",
  "Conclusion & Summary",
  "References",
  "Tables",
  "Annexures",
];

const QUICK_PROMPTS = [
  "Expand paragraph 2 with more detail",
  "Add recent 2024-2025 studies",
  "Condense to approximately 500 words",
  "Add a classical reference",
  "Make the language more formal",
  "Check for logical consistency",
  "Add statistical power analysis",
  "Summarize key findings",
];

type StreamingState = {
  isStreaming: boolean;
  content: string;
};

// Sortable Section Item
function SortableSection({
  section,
  isActive,
  onClick,
  onDelete,
}: {
  section: any;
  isActive: boolean;
  onClick: () => void;
  onDelete: (id: number) => void;
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

  const searchParams = new URLSearchParams(window.location.search);
  const [activeSectionId, setActiveSectionId] = useState<number | null>(
    searchParams.get("section") ? parseInt(searchParams.get("section")!, 10) : null
  );

  const { data: workspace } = useGetWorkspace(workspaceId, {
    query: { enabled: !!workspaceId, queryKey: getGetWorkspaceQueryKey(workspaceId) },
  });

  const { data: sections, isLoading: isSectionsLoading } = useListSections(workspaceId, {
    query: { enabled: !!workspaceId, queryKey: getListSectionsQueryKey(workspaceId) },
  });

  useEffect(() => {
    if (sections && sections.length > 0 && !activeSectionId) {
      setActiveSectionId(sections[0].id);
    }
  }, [sections, activeSectionId]);

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
    createSection.mutate(
      { workspaceId, data: { title: t, type: "custom", status: "not_started" } },
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
    setChatInput("");

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
            } else if (data.type === "done") {
              const assistantMsg = { role: "assistant", content: fullContent, id: `ai-${Date.now()}` };
              setLocalMessages((prev) => [...prev, assistantMsg]);
              setChatStreaming({ isStreaming: false, content: "" });
              queryClient.invalidateQueries({ queryKey: getListChatMessagesQueryKey(workspaceId, activeSectionId) });
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

  // Section generation SSE
  const [generating, setGenerating] = useState(false);
  const [generatingContent, setGeneratingContent] = useState("");

  const handleGenerate = async () => {
    if (!activeSection || generating) return;
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
            prompt: `Generate a comprehensive and scholarly ${activeSection.title} section for this thesis. Follow standard academic conventions and include appropriate citations as [Author, Year] placeholders.`,
            tone: "academic",
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
              setEditorHtml(`<p>${accumulated.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`);
              queryClient.invalidateQueries({ queryKey: getListSectionsQueryKey(workspaceId) });
              toast({ title: "Section generated", description: `${activeSection.title} content generated successfully.` });
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
    <div className="h-[calc(100vh-4rem)] flex flex-col -mx-6 lg:-mx-10 -my-6 lg:-my-10 bg-background overflow-hidden">
      {/* Top Bar */}
      <div className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0 bg-card">
        <div className="flex items-center gap-3">
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
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Sections */}
        <div className="w-56 border-r border-border bg-muted/10 flex flex-col shrink-0">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sections</span>
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 max-h-72 overflow-y-auto">
                  {STANDARD_SECTIONS.map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => handleCreateSection(s)}
                      className="text-xs"
                    >
                      {s}
                    </DropdownMenuItem>
                  ))}
                  <Separator className="my-1" />
                  <DropdownMenuItem
                    onClick={() => setIsDialogOpen(true)}
                    className="text-xs font-medium"
                  >
                    <Plus className="w-3 h-3 mr-1.5" /> Custom Section
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <ScrollArea className="flex-1 px-2 py-2">
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
          {sections && sections.length > 0 && (
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

        {/* Center - Editor */}
        <div className="flex-1 flex flex-col bg-card min-w-0">
          {activeSection ? (
            <>
              {/* Section Header */}
              <div className="px-6 py-3 border-b border-border shrink-0 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-serif font-bold text-foreground">{activeSection.title}</h2>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span className="uppercase tracking-wider">{activeSection.type}</span>
                    <span>·</span>
                    <span
                      className={cn(
                        "capitalize font-medium",
                        activeSection.status === "completed" ? "text-primary" :
                        activeSection.status === "in_progress" ? "text-amber-500" : "text-muted-foreground"
                      )}
                    >
                      {activeSection.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="gap-1.5 text-xs h-8 border-primary/20 text-primary hover:bg-primary/5"
                >
                  {generating ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5" /> Generate with AI</>
                  )}
                </Button>
              </div>

              {/* Tiptap Editor */}
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
                <TiptapEditor
                  key={activeSectionId}
                  content={editorHtml}
                  onChange={handleEditorChange}
                  placeholder={`Start writing ${activeSection.title}… or click "Generate with AI"`}
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
            chatOpen ? "w-80" : "w-10"
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
                      className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[95%] px-3 py-2 rounded-lg text-xs leading-relaxed whitespace-pre-wrap",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-tr-none"
                            : "bg-card border border-border text-foreground rounded-tl-none"
                        )}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}

                {chatStreaming.isStreaming && chatStreaming.content && (
                  <div className="flex flex-col items-start">
                    <div className="max-w-[95%] px-3 py-2 rounded-lg text-xs leading-relaxed bg-card border border-border text-foreground rounded-tl-none whitespace-pre-wrap">
                      {chatStreaming.content}
                      <span className="inline-block w-1 h-3 bg-primary animate-pulse ml-0.5 align-middle" />
                    </div>
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
                <div className="flex gap-2">
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
                    disabled={!activeSectionId || chatStreaming.isStreaming}
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
    </div>
  );
}
