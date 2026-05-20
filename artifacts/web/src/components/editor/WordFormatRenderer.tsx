import { cn } from "@/lib/utils";
import { expandVaultCitationsInText, type VaultCitationCatalog } from "@workspace/vault-citations";

type WordFormatRendererProps = {
  title: string;
  htmlContent: string;
  workspaceTitle?: string;
  qualification?: string;
  catalog?: VaultCitationCatalog;
  className?: string;
};

function renderBodyHtml(html: string, catalog: VaultCitationCatalog): string {
  const text = html || "<p></p>";
  const withCitations = expandVaultCitationsInText(
    text.replace(/<[^>]+>/g, (tag) => tag).replace(/\[HIGHLIGHT\]([\s\S]*?)\[\/HIGHLIGHT\]/g, '<mark class="thesis-highlight">$1</mark>'),
    catalog,
  );
  return withCitations
    .replace(/\[V(\d+)\]/g, '<sup class="citation-key">[V$1]</sup>')
    .replace(/<mark class="thesis-highlight">/g, '<mark class="thesis-highlight bg-amber-100 text-amber-950 px-0.5 rounded">');
}

export function WordFormatRenderer({
  title,
  htmlContent,
  workspaceTitle,
  qualification,
  catalog = {},
  className,
}: WordFormatRendererProps) {
  const body = renderBodyHtml(htmlContent, catalog);

  return (
    <div className={cn("word-format-page mx-auto bg-white text-black shadow-lg", className)}>
      <style>{`
        .word-format-page {
          width: 210mm;
          min-height: 297mm;
          padding: 25mm 20mm 25mm 25mm;
          font-family: "Times New Roman", Times, serif;
          font-size: 12pt;
          line-height: 1.5;
          color: #111;
        }
        .word-format-page .page-header {
          border-bottom: 1px solid #ddd;
          padding-bottom: 8px;
          margin-bottom: 24px;
          font-size: 10pt;
          color: #666;
          display: flex;
          justify-content: space-between;
        }
        .word-format-page .section-title {
          font-size: 16pt;
          font-weight: bold;
          text-align: center;
          margin: 0 0 24px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .word-format-page .thesis-body p {
          margin: 0 0 12pt;
          text-align: justify;
          text-indent: 0;
        }
        .word-format-page .citation-key {
          color: #1d4ed8;
          font-size: 9pt;
        }
        .word-format-page .page-footer {
          margin-top: 32px;
          padding-top: 8px;
          border-top: 1px solid #ddd;
          font-size: 10pt;
          color: #666;
          text-align: center;
        }
      `}</style>
      <div className="page-header">
        <span>{workspaceTitle ?? "Thesis"}</span>
        <span>{qualification ?? "MD/MS Thesis"}</span>
      </div>
      <h1 className="section-title">{title}</h1>
      <div
        className="thesis-body prose prose-sm max-w-none prose-p:my-3 prose-strong:font-semibold"
        dangerouslySetInnerHTML={{ __html: body }}
      />
      <div className="page-footer">MANTHANA-SCHOLER · Word Format Preview</div>
    </div>
  );
}
