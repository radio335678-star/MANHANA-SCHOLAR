import { useEffect } from "react";
import type { PreThesisDocumentV2 } from "@/lib/preThesisDocumentTypes";
import { ExternalLink } from "lucide-react";
import "./preThesisDocumentTheme.css";

type PreThesisDocumentPreviewProps = {
  document: PreThesisDocumentV2;
  scrollToAnchor?: string | null;
};

function DocTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <table className="pre-thesis-table">
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PreThesisDocumentPreview({ document: doc, scrollToAnchor }: PreThesisDocumentPreviewProps) {
  const h = doc.header;

  useEffect(() => {
    if (!scrollToAnchor) return;
    const el = document.getElementById(scrollToAnchor);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scrollToAnchor, doc]);

  return (
    <div className="pre-thesis-doc-root">
      <div className="pre-thesis-doc-scroll">
        {/* Cover / title page */}
        <section className="pre-thesis-page" id="pt-cover">
          <h1 className="pre-thesis-doc-title">{h.degreeTitle} — PRE-REFERENCE STRUCTURE FILE</h1>
          <p className="pre-thesis-doc-subtitle">
            {h.universityName ?? "University"} | {h.universityOrdinances}
          </p>
          <p className="pre-thesis-doc-meta">
            {[
              h.candidateName && `Candidate: ${h.candidateName}`,
              h.guideName && `Guide: ${h.guideName}`,
              h.coGuideName && `Co-Guide: ${h.coGuideName}`,
              h.departmentName && `Dept. of ${h.departmentName}`,
              h.collegeName,
              h.state,
            ]
              .filter(Boolean)
              .join("  |  ")}
          </p>
          <p className="pre-thesis-doc-meta">
            Thesis: {h.workspaceTitle}
            <br />
            {h.domain}
            {h.qualification ? ` · ${h.qualification}` : ""}
          </p>
          <p className="pre-thesis-doc-meta">
            Generated: {h.generatedAt.slice(0, 10)} | Last verified:{" "}
            {h.lastLiveVerifiedAt.slice(0, 10)}
          </p>
        </section>

        {/* Part A */}
        <section className="pre-thesis-page" id="pt-part-a">
          <h2 className="pre-thesis-h2">Part A — Preliminary Pages</h2>
          <p className="pre-thesis-note">Pagination: {doc.partA.paginationNote}</p>
          <DocTable
            headers={["#", "Page", "Content"]}
            rows={doc.partA.preliminaryPages.map((p) => [p.page, p.title, p.content])}
          />
        </section>

        {/* Part B */}
        <section className="pre-thesis-page" id="pt-part-b">
          <h2 className="pre-thesis-h2">Part B — Main Body of Thesis</h2>
          <p className="pre-thesis-note">Pagination: {doc.partB.paginationNote}</p>
          <p className="pre-thesis-note">{doc.partB.pageLimitNote}</p>
          <DocTable
            headers={["Chapter", "Title", "Recommended Pages"]}
            rows={doc.partB.chapters.map((c) => [
              c.chapter,
              c.title,
              c.minPages != null && c.maxPages != null
                ? `${c.minPages}–${c.maxPages} pages`
                : "—",
            ])}
          />
        </section>

        {/* Part C */}
        <section className="pre-thesis-page" id="pt-part-c">
          <h2 className="pre-thesis-h2">Part C — Supplementary Material</h2>
          <p className="pre-thesis-note">{doc.partC.paginationNote}</p>
          <DocTable
            headers={["Section", "Content"]}
            rows={doc.partC.supplementary.map((s) => [s.title, s.content ?? s.title])}
          />
        </section>

        {/* Formatting */}
        <section className="pre-thesis-page" id="pt-formatting">
          <h2 className="pre-thesis-h2">Word Formatting Specifications</h2>
          <p className="pre-thesis-note">{doc.formattingSpecs.sourceNote}</p>
          <DocTable
            headers={["Element", "Specification"]}
            rows={doc.formattingSpecs.rows.map((r) => [r.element, r.specification])}
          />
        </section>

        {/* Chapter blueprints */}
        <section className="pre-thesis-page" id="pt-chapters">
          <h2 className="pre-thesis-h2">Chapter-by-Chapter Content Blueprint</h2>
          {doc.chapterBlueprints.map((bp) => (
            <div key={bp.chapter} id={`pt-chapter-${bp.chapter.replace(/\s+/g, "-")}`}>
              <h3 className="pre-thesis-h3">
                {bp.chapter} — {bp.title}
              </h3>
              <ul className="pre-thesis-ul">
                {bp.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {/* Key rules + references */}
        <section className="pre-thesis-page" id="pt-rules">
          <h2 className="pre-thesis-h2">Key Rules to Remember</h2>
          <ul className="pre-thesis-rule-list">
            {doc.keyRules.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ul>

          <h2 className="pre-thesis-h2">References — Format Guide (Vancouver Style)</h2>
          <p className="pre-thesis-note">{doc.referencesGuide.intro}</p>
          <ul className="pre-thesis-ul">
            {doc.referencesGuide.examples.map((ex, i) => (
              <li key={i}>{ex}</li>
            ))}
          </ul>
          {doc.referencesGuide.seedReferences && doc.referencesGuide.seedReferences.length > 0 && (
            <>
              <h3 className="pre-thesis-h3">Seed references</h3>
              <ul className="pre-thesis-ul">
                {doc.referencesGuide.seedReferences.map((ref, i) => (
                  <li key={i}>{ref}</li>
                ))}
              </ul>
            </>
          )}

          {doc.annexureTemplates.length > 0 && (
            <>
              <h2 className="pre-thesis-h2">Annexure Templates</h2>
              {doc.annexureTemplates.map((a) => (
                <div key={a.id} className="mb-4">
                  <h3 className="pre-thesis-h3">{a.title}</h3>
                  {a.templateContent && (
                    <p className="text-[10pt] whitespace-pre-wrap">{a.templateContent}</p>
                  )}
                </div>
              ))}
            </>
          )}
        </section>

        {doc.literatureReferences && doc.literatureReferences.length > 0 && (
          <section className="pre-thesis-page" id="pt-literature-references">
            <h2 className="pre-thesis-h2">Literature References (Topic Research)</h2>
            <p className="pre-thesis-note">
              {doc.literatureReferences.length} references collected via AI-assisted web search on thesis topic.
            </p>
            <ol className="pre-thesis-ul" style={{ listStyleType: "none", paddingLeft: 0 }}>
              {doc.literatureReferences.map((ref) => (
                <li key={ref.serialNo} id={`pt-literature-ref-${ref.serialNo}`} className="mb-3">
                  <span className="font-medium">{ref.serialNo}. </span>
                  <span>{ref.vancouverCitation}</span>
                  {(ref.url || ref.doi) && (
                    <a
                      href={ref.doi ? `https://doi.org/${ref.doi}` : ref.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 text-primary inline-flex items-center gap-0.5 text-[9pt]"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {ref.relevanceNote && (
                    <p className="text-[9pt] text-muted-foreground ml-4 mt-0.5 italic">{ref.relevanceNote}</p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
