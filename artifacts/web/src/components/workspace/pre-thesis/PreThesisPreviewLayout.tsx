import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sparkles } from "lucide-react";
import { PreThesisPreviewTabs, type PreThesisPreviewData } from "./PreThesisPreviewTabs";
import { PreThesisAiAssistant } from "./PreThesisAiAssistant";
import type { PreThesisChatStreamEvent } from "@/hooks/usePreThesisChatStream";

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

  const handleDocUpdate = (event: Extract<PreThesisChatStreamEvent, { type: "document_updated" }>) => {
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
      onStreamingChange={onStreamingChange}
      className="lg:h-[min(70vh,720px)]"
    />
  );

  return (
    <div className="space-y-4">
      {/* Desktop: split pane */}
      <div className="hidden lg:grid lg:grid-cols-[1fr_minmax(280px,360px)] gap-6 items-start">
        <div>{tabsBlock}</div>
        <div className="sticky top-4">{assistantBlock}</div>
      </div>

      {/* Mobile: tabs + FAB sheet */}
      <div className="lg:hidden space-y-4">
        {tabsBlock}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button className="fixed bottom-6 right-6 z-40 shadow-lg gap-2 rounded-full h-12 px-5 lg:hidden">
              <Sparkles className="w-4 h-4" />
              Customize with AI
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col">
            <SheetHeader className="px-4 pt-4 pb-2 shrink-0">
              <SheetTitle>Pre-Thesis AI Assistant</SheetTitle>
            </SheetHeader>
            <div className="flex-1 min-h-0 px-4 pb-4">{assistantBlock}</div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
