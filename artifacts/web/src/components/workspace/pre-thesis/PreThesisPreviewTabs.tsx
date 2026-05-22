import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FileText, BookOpen, ExternalLink } from "lucide-react";
import { PreThesisDocumentPreview } from "./PreThesisDocumentPreview";
import { parsePreThesisDocument, type PreThesisDocumentV2 } from "@/lib/preThesisDocumentTypes";

export type PreThesisPreviewData = {
  resultJson: Record<string, unknown> | null;
  sources: Array<{ id: number; title: string; url: string | null; attribution: string }>;
  warnings: string[];
  completenessScore: number | null;
};

type PreThesisPreviewTabsProps = {
  data: PreThesisPreviewData;
  previewTab: string;
  onPreviewTabChange: (tab: string) => void;
  scrollAnchor?: string | null;
};

export function derivePreThesisViews(data: PreThesisPreviewData) {
  const doc = parsePreThesisDocument(data.resultJson);
  const chapterBlueprints = doc?.chapterBlueprints ?? [];
  const formattingRows = doc?.formattingSpecs.rows ?? [];
  const partBChapters = doc?.partB.chapters ?? [];
  const docSources = doc?.sources ?? [];
  const literatureReferences = doc?.literatureReferences ?? [];

  return { doc, chapterBlueprints, formattingRows, partBChapters, docSources, literatureReferences };
}

export function PreThesisPreviewTabs({
  data,
  previewTab,
  onPreviewTabChange,
  scrollAnchor,
}: PreThesisPreviewTabsProps) {
  const { doc, chapterBlueprints, formattingRows, partBChapters, docSources, literatureReferences } =
    derivePreThesisViews(data);

  const sourceCount = data.sources.length || docSources.length;

  return (
    <Tabs value={previewTab} onValueChange={onPreviewTabChange}>
      <TabsList className="flex flex-wrap h-auto gap-1">
        <TabsTrigger value="document" className="gap-1">
          <FileText className="w-3.5 h-3.5" />
          Document Preview
        </TabsTrigger>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="formatting">Formatting</TabsTrigger>
        <TabsTrigger value="chapters">Chapters</TabsTrigger>
        <TabsTrigger value="references" className="gap-1">
          <BookOpen className="w-3.5 h-3.5" />
          References
          {literatureReferences.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-1">{literatureReferences.length}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="sources">Sources</TabsTrigger>
      </TabsList>

      <TabsContent value="document" className="mt-4">
        {doc ? (
          <PreThesisDocumentPreview document={doc} scrollToAnchor={scrollAnchor} />
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Run Build Pre-Thesis to generate the document preview.
          </p>
        )}
      </TabsContent>

      <TabsContent value="overview" className="mt-4 text-sm space-y-2">
        <p>
          <strong>Completeness:</strong>{" "}
          {data.completenessScore != null ? `${data.completenessScore}%` : "—"}
        </p>
        <p>
          <strong>Sources:</strong> {sourceCount} (template + live)
        </p>
        <p>
          <strong>Chapter blueprints:</strong> {chapterBlueprints.length}
        </p>
        <p>
          <strong>Main body chapters:</strong> {partBChapters.length}
        </p>
        <p>
          <strong>Formatting rules:</strong> {formattingRows.length}
        </p>
        {data.warnings.length > 0 && (
          <ul className="list-disc pl-4 text-amber-800">
            {data.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="formatting" className="mt-4">
        {formattingRows.length > 0 ? (
          <div className="border rounded overflow-hidden text-sm">
            {formattingRows.map((r, i) => (
              <div key={i} className="grid grid-cols-2 border-b last:border-0 px-3 py-2">
                <span className="font-medium">{r.element}</span>
                <span className="text-muted-foreground">{r.specification}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No formatting specs yet.</p>
        )}
      </TabsContent>

      <TabsContent value="chapters" className="mt-4 space-y-4 max-h-96 overflow-y-auto">
        {chapterBlueprints.length > 0 ? (
          chapterBlueprints.map((bp) => (
            <div key={bp.chapter} className="border rounded p-3">
              <h4 className="font-medium text-sm">
                {bp.chapter} — {bp.title}
              </h4>
              <ul className="mt-2 text-xs text-muted-foreground list-disc pl-4">
                {bp.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No chapter blueprints yet.</p>
        )}
      </TabsContent>

      <TabsContent value="references" className="mt-4 space-y-3 max-h-[500px] overflow-y-auto">
        {literatureReferences.length > 0 ? (
          <>
            <p className="text-xs text-muted-foreground">
              {literatureReferences.length} references collected by AI from web search on your thesis topic.
              Saved to Research Vault.
            </p>
            {literatureReferences.map((ref) => (
              <div
                key={ref.serialNo}
                id={`pt-literature-ref-${ref.serialNo}`}
                className="border rounded-lg p-3 space-y-1.5 text-sm"
              >
                <div className="flex items-start gap-2">
                  <span className="font-mono text-xs text-muted-foreground w-6 shrink-0">{ref.serialNo}.</span>
                  <div className="flex-1">
                    <p className="font-medium leading-snug">{ref.title}</p>
                    <p className="text-xs text-muted-foreground">{ref.authors}{ref.year ? `, ${ref.year}` : ""}{ref.journal ? ` — ${ref.journal}` : ""}</p>
                    <p className="text-xs text-foreground/70 mt-1 italic">{ref.vancouverCitation}</p>
                    {ref.relevanceNote && (
                      <p className="text-xs text-muted-foreground mt-1 bg-muted/40 px-2 py-1 rounded">{ref.relevanceNote}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      {ref.url && (
                        <a href={ref.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> View source
                        </a>
                      )}
                      {ref.doi && (
                        <a href={`https://doi.org/${ref.doi}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> DOI
                        </a>
                      )}
                      {ref.vaultResourceId && (
                        <Badge variant="secondary" className="text-[10px]">Saved to Vault</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No literature references yet. Run the pre-thesis build to collect topic-specific citations.
          </p>
        )}
      </TabsContent>

      <TabsContent value="sources" className="mt-4 space-y-2 max-h-96 overflow-y-auto">
        {(data.sources.length > 0 ? data.sources : docSources.map((s, i) => ({
          id: i,
          title: s.title,
          url: s.url ?? null,
          attribution: s.attribution,
        }))).map((s) => (
          <div key={s.id} className="text-sm border rounded p-2">
            <Badge variant="outline" className="text-xs mr-2">
              {s.attribution}
            </Badge>
            {s.url ? (
              <a href={s.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {s.title}
              </a>
            ) : (
              s.title
            )}
          </div>
        ))}
      </TabsContent>
    </Tabs>
  );
}
