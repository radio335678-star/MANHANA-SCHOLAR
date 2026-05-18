import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { 
  useGetWorkspace, 
  useListSections, 
  useUpdateSection,
  useListChatMessages,
  useSendChatMessage,
  useGenerateSectionContent,
  useCreateSection,
  getGetWorkspaceQueryKey,
  getListSectionsQueryKey,
  getListChatMessagesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ArrowLeft, MessageSquare, Save, Plus, FileText, CheckCircle2, Circle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function WorkspaceEditor({ id }: { id: string }) {
  const workspaceId = parseInt(id, 10);
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeSectionId, setActiveSectionId] = useState<number | null>(null);
  
  // URL sync
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const sectionParam = searchParams.get('section');
  
  useEffect(() => {
    if (sectionParam) {
      setActiveSectionId(parseInt(sectionParam, 10));
    }
  }, [sectionParam]);

  const { data: workspace, isLoading: isWsLoading } = useGetWorkspace(workspaceId, {
    query: {
      enabled: !!workspaceId,
      queryKey: getGetWorkspaceQueryKey(workspaceId)
    }
  });

  const { data: sections, isLoading: isSectionsLoading } = useListSections(workspaceId, {
    query: {
      enabled: !!workspaceId,
      queryKey: getListSectionsQueryKey(workspaceId)
    }
  });

  useEffect(() => {
    if (sections && sections.length > 0 && !activeSectionId) {
      setActiveSectionId(sections[0].id);
    }
  }, [sections, activeSectionId]);

  const activeSection = sections?.find(s => s.id === activeSectionId);

  // Content state
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const updateSection = useUpdateSection();

  useEffect(() => {
    if (activeSection) {
      setContent(activeSection.content || "");
    }
  }, [activeSection]);

  const handleSave = () => {
    if (!activeSection) return;
    setIsSaving(true);
    updateSection.mutate({
      workspaceId,
      sectionId: activeSection.id,
      data: { content }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSectionsQueryKey(workspaceId) });
        toast({ title: "Section saved" });
      },
      onSettled: () => setIsSaving(false)
    });
  };

  const handleStatusChange = (newStatus: "not_started" | "in_progress" | "completed" | "reviewed") => {
    if (!activeSection) return;
    updateSection.mutate({
      workspaceId,
      sectionId: activeSection.id,
      data: { status: newStatus }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSectionsQueryKey(workspaceId) });
      }
    });
  };

  // Chat state
  const [chatInput, setChatInput] = useState("");
  const { data: messages, isLoading: isMessagesLoading } = useListChatMessages(workspaceId, activeSectionId || 0, {
    query: {
      enabled: !!activeSectionId,
      queryKey: getListChatMessagesQueryKey(workspaceId, activeSectionId || 0)
    }
  });
  
  const sendMessage = useSendChatMessage();
  
  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeSectionId) return;
    
    sendMessage.mutate({
      workspaceId,
      sectionId: activeSectionId,
      data: { content: chatInput, includeContext: true }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChatMessagesQueryKey(workspaceId, activeSectionId) });
        setChatInput("");
      }
    });
  };

  const createSection = useCreateSection();
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionType, setNewSectionType] = useState<any>("custom");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleCreateSection = () => {
    if (!newSectionTitle.trim()) return;
    createSection.mutate({
      workspaceId,
      data: {
        title: newSectionTitle,
        type: newSectionType,
        status: "not_started"
      }
    }, {
      onSuccess: (newSec) => {
        queryClient.invalidateQueries({ queryKey: getListSectionsQueryKey(workspaceId) });
        setActiveSectionId(newSec.id);
        setIsDialogOpen(false);
        setNewSectionTitle("");
      }
    });
  };

  if (isWsLoading || isSectionsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col -mx-6 lg:-mx-10 -my-6 lg:-my-10 bg-background overflow-hidden animate-in fade-in duration-500">
      
      <div className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0 bg-card">
        <div className="flex items-center gap-4">
          <Link href={`/workspaces/${workspaceId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="font-serif font-medium truncate max-w-sm">{workspace?.title}</div>
        </div>
        {activeSection && (
          <div className="flex items-center gap-2">
            <Button 
              variant={activeSection.status === "completed" ? "default" : "outline"} 
              size="sm" 
              onClick={() => handleStatusChange(activeSection.status === "completed" ? "in_progress" : "completed")}
              className="h-8 text-xs"
            >
              {activeSection.status === "completed" ? <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> : <Circle className="w-3.5 h-3.5 mr-1" />}
              {activeSection.status === "completed" ? "Marked Complete" : "Mark Complete"}
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
              Save
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Sections */}
        <div className="w-64 border-r border-border bg-muted/20 flex flex-col shrink-0">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Sections</span>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6"><Plus className="w-4 h-4" /></Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Section</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Title</label>
                    <Input value={newSectionTitle} onChange={e => setNewSectionTitle(e.target.value)} placeholder="e.g. Methodology" />
                  </div>
                  <Button onClick={handleCreateSection} disabled={!newSectionTitle.trim() || createSection.isPending} className="w-full">
                    {createSection.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Create Section
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {sections?.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSectionId(section.id)}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors flex items-center gap-2
                    ${activeSectionId === section.id 
                      ? 'bg-secondary text-foreground font-medium shadow-sm border border-border/50' 
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'}`}
                >
                  <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{section.title}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Center - Editor */}
        <div className="flex-1 flex flex-col bg-card min-w-0">
          {activeSection ? (
            <>
              <div className="px-8 py-6 border-b border-border shrink-0">
                <h2 className="text-2xl font-serif font-bold text-foreground">{activeSection.title}</h2>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="uppercase tracking-wider">{activeSection.type.replace("_", " ")}</span>
                  <span>•</span>
                  <span>{activeSection.wordCount || 0} words</span>
                </div>
              </div>
              <div className="flex-1 p-8 overflow-auto">
                <Textarea 
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={`Start writing ${activeSection.title}...`}
                  className="min-h-full w-full max-w-3xl mx-auto resize-none border-none shadow-none focus-visible:ring-0 text-base leading-relaxed p-0 bg-transparent"
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-2">
              <FileText className="w-8 h-8 opacity-20" />
              <p>Select or create a section to start writing</p>
            </div>
          )}
        </div>

        {/* Right Sidebar - Chat */}
        <div className="w-80 border-l border-border bg-muted/10 flex flex-col shrink-0">
          <div className="p-3 border-b border-border flex items-center gap-2 bg-card">
            <MessageSquare className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">AI Assistant</span>
          </div>
          
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages?.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[90%] px-3 py-2 rounded-lg text-sm ${
                    msg.role === 'user' 
                      ? 'bg-primary text-primary-foreground rounded-tr-none' 
                      : 'bg-card border border-border text-foreground rounded-tl-none'
                  }`}>
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 mx-1">
                    {format(new Date(msg.createdAt), "h:mm a")}
                  </span>
                </div>
              ))}
              {sendMessage.isPending && (
                <div className="flex items-start">
                  <div className="px-3 py-2 rounded-lg text-sm bg-card border border-border text-muted-foreground rounded-tl-none">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          
          <div className="p-3 bg-card border-t border-border">
            <form onSubmit={handleChatSubmit} className="flex gap-2">
              <Input 
                value={chatInput} 
                onChange={e => setChatInput(e.target.value)} 
                placeholder="Ask for research help..." 
                className="flex-1 text-sm h-9"
                disabled={sendMessage.isPending || !activeSectionId}
              />
              <Button type="submit" size="sm" className="h-9 px-3" disabled={sendMessage.isPending || !activeSectionId || !chatInput.trim()}>
                Send
              </Button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
