import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sparkles } from "lucide-react";
import { PreThesisPreviewTabs, type PreThesisPreviewData } from "./PreThesisPreviewTabs";
import { PreThesisAiAssistant } from "./PreThesisAiAssistant";
import type { PreThesisChatStreamEvent } from "@/hooks/usePreThesisChatStream";
import { cn } from "@/lib/utils";

type PreThesisPreviewLayoutProps = {
  workspaceId: number;
  data: PreThesisPreviewData;
  previewTab: string;
  onPreviewTabChange: (tab: string) => void;
  scrollAnchor: string | null;
  onScrollAnchorChange: (anchor: string | null) => void;
  disabled?: boolean;
  onDocumentUpdated: (payload: {
    resultJson: Record<string, unknown>;
    preThesisDraftMd: string;
    completenessScore: number;
    summary: string;
  }) => void;
  onStreamingChange?: (streaming: boolean) => void;
};

export function PreThesisPreviewLayout({
  workspaceId,
  data,
  previewTab,
  onPreviewTabChange,
  scrollAnchor,
  onScrollAnchorChange,
  disabled,
  onDocumentUpdated,
  onStreamingChange,
}: PreThesisPreviewLayoutProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [aiStreaming, setAiStreaming] = useState(false);

  const handleDocUpdate = (
    event: Extract<PreThesisChatStreamEvent, { type: "document_updated" }>,
  ) => {
    onDocumentUpdated({
      resultJson: event.document as unknown as Record<string, unknown>,
      preThesisDraftMd: event.draftMd,
      completenessScore: event.completenessScore,
      summary: event.summary,
    });
    if (event.scrollAnchor) {
      onScrollAnchorChange(event.scrollAnchor);
      onPreviewTabChange("document");
    }
  };

  const handleStreamingChange = (s: boolean) => {
    setAiStreaming(s);
    onStreamingChange?.(s);
  };

  const tabsBlock = (
    <PreThesisPreviewTabs
      data={data}
      previewTab={previewTab}
      onPreviewTabChange={onPreviewTabChange}
      scrollAnchor={scrollAnchor}
    />
  );

  const assistantBlock = (
    <PreThesisAiAssistant
      workspaceId={workspaceId}
      disabled={disabled}
      onDocumentUpdated={handleDocUpdate}
      onStreamingChange={handleStreamingChange}
      className="h-[min(80vh,860px)]"
    />
  );

  return (
    <div className="space-y-4">
      {/* Desktop: wider split pane */}
      <div className="hidden lg:grid lg:grid-cols-[1fr_minmax(340px,420px)] gap-6 items-start">
        <div>{tabsBlock}</div>
        <div className="sticky top-4">{assistantBlock}</div>
      </div>

      {/* Mobile: tabs + FAB sheet */}
      <div className="lg:hidden space-y-4">
        {tabsBlock}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            {/* FAB with pulsing badge when AI is working */}
            <Button className="fixed bottom-6 right-6 z-40 shadow-xl gap-2 rounded-full h-12 px-5 lg:hidden">
              <span className="relative">
                <Sparkles className="w-4 h-4" />
                {aiStreaming && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse border-2 border-white dark:border-background" />
                )}
              </span>
              <span className={cn(aiStreaming && "animate-pulse")}>
                {aiStreaming ? "Working…" : "Customize with AI"}
              </span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col rounded-t-2xl">
            {/* Drag handle */}
            <div className="mx-auto w-10 h-1.5 rounded-full bg-muted mt-3 mb-1 shrink-0" />
            <SheetHeader className="px-4 pt-2 pb-2 shrink-0 border-b">
              <SheetTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Pre-Thesis AI Assistant
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 min-h-0 p-3">{assistantBlock}</div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
