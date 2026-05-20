import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import TiptapEditor from "@/components/editor/TiptapEditor";
import { WordFormatRenderer } from "@/components/editor/WordFormatRenderer";
import type { Editor } from "@tiptap/react";
import type { VaultCitationCatalog } from "@workspace/vault-citations";

type ThesisPreviewProps = {
  sectionTitle: string;
  sectionType: string;
  htmlContent: string;
  workspaceTitle?: string;
  qualification?: string;
  catalog?: VaultCitationCatalog;
  manualEdit: boolean;
  onToggleManualEdit: () => void;
  onChange?: (html: string, text: string) => void;
  onEditorReady?: (editor: Editor) => void;
  streamingContent?: string;
  isStreaming?: boolean;
  className?: string;
};

export function ThesisPreview({
  sectionTitle,
  sectionType,
  htmlContent,
  workspaceTitle,
  qualification,
  catalog,
  manualEdit,
  onToggleManualEdit,
  onChange,
  onEditorReady,
  streamingContent,
  isStreaming,
  className,
}: ThesisPreviewProps) {
  const displayHtml = isStreaming && streamingContent
    ? streamingContent.replace(/\n\n/g, "</p><p>").replace(/^/, "<p>").replace(/$/, "</p>")
    : htmlContent;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="px-6 py-3 border-b border-border shrink-0 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-serif font-bold text-foreground">{sectionTitle}</h2>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
            <span className="uppercase tracking-wider">{sectionType}</span>
            {!manualEdit && (
              <Badge variant="secondary" className="gap-1 text-[10px] h-5">
                <Sparkles className="w-3 h-3" />
                AI Controlled
              </Badge>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant={manualEdit ? "default" : "outline"}
          onClick={onToggleManualEdit}
          className="gap-1.5 text-xs h-8"
        >
          <PenLine className="w-3.5 h-3.5" />
          {manualEdit ? "Preview Mode" : "Enable Manual Edit"}
        </Button>
      </div>

      <div className="flex-1 overflow-auto bg-muted/30 p-6">
        {manualEdit ? (
          <div className="h-full bg-background rounded-lg border border-border overflow-hidden">
            <TiptapEditor
              content={htmlContent}
              onChange={onChange ?? (() => {})}
              onEditorReady={onEditorReady}
              placeholder={`Edit ${sectionTitle}…`}
              className="h-full"
            />
          </div>
        ) : (
          <WordFormatRenderer
            title={sectionTitle}
            htmlContent={displayHtml}
            workspaceTitle={workspaceTitle}
            qualification={qualification}
            catalog={catalog}
            className={cn(isStreaming && "ring-2 ring-primary/20")}
          />
        )}
      </div>
    </div>
  );
}
