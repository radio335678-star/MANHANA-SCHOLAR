import type { PreThesisDocumentV2 } from "../types/preThesisDocumentV2";

export function compilePreThesisMdV2(doc: PreThesisDocumentV2): string {
  const h = doc.header;
  const lines: string[] = [];

  lines.push(`${h.degreeTitle} — PRE-REFERENCE STRUCTURE FILE`);
  lines.push(
    `${h.universityName ?? "University"} | ${doc.header.universityOrdinances}`,
  );
  const meta: string[] = [];
  if (h.candidateName) meta.push(`Candidate: ${h.candidateName}`);
  if (h.guideName) meta.push(`Guide: ${h.guideName}`);
  if (h.coGuideName) meta.push(`Co-Guide: ${h.coGuideName}`);
  if (h.departmentName) meta.push(`Dept. of ${h.departmentName}`);
  if (h.collegeName) meta.push(h.collegeName);
  if (h.state) meta.push(h.state);
  if (meta.length) lines.push(meta.join("  |  "));
  lines.push(
    `Generated: ${h.generatedAt.slice(0, 10)} | Last Live Verified: ${h.lastLiveVerifiedAt.slice(0, 10)}`,
  );
  lines.push("");

  lines.push("PART A — PRELIMINARY PAGES");
  lines.push(`Pagination: ${doc.partA.paginationNote}`);
  lines.push("| # | Page | Content |");
  lines.push("|---|------|---------|");
  for (const p of doc.partA.preliminaryPages) {
    lines.push(`| ${p.page} | ${p.title} | ${p.content} |`);
  }
  lines.push("");

  lines.push("PART B — MAIN BODY OF THESIS");
  lines.push(`Pagination: ${doc.partB.paginationNote}`);
  lines.push(doc.partB.pageLimitNote);
  lines.push("| Chapter | Title | Recommended Pages |");
  lines.push("|---------|-------|-------------------|");
  for (const c of doc.partB.chapters) {
    const pages =
      c.minPages != null && c.maxPages != null ? `${c.minPages}–${c.maxPages} pages` : "—";
    lines.push(`| ${c.chapter} | ${c.title} | ${pages} |`);
  }
  lines.push("");

  lines.push("PART C — SUPPLEMENTARY MATERIAL");
  lines.push(doc.partC.paginationNote);
  lines.push("| Section | Content |");
  lines.push("|---------|---------|");
  for (const s of doc.partC.supplementary) {
    lines.push(`| ${s.title} | ${s.content ?? s.title} |`);
  }
  lines.push("");

  lines.push("WORD FORMATTING SPECIFICATIONS");
  lines.push(doc.formattingSpecs.sourceNote);
  lines.push("| Element | Specification |");
  lines.push("|---------|---------------|");
  for (const row of doc.formattingSpecs.rows) {
    lines.push(`| ${row.element} | ${row.specification} |`);
  }
  lines.push("");

  lines.push("CHAPTER-BY-CHAPTER CONTENT BLUEPRINT");
  for (const bp of doc.chapterBlueprints) {
    lines.push(`${bp.chapter} — ${bp.title}`);
    for (const bullet of bp.bullets) {
      lines.push(`- ${bullet}`);
    }
    lines.push("");
  }

  lines.push("KEY RULES TO REMEMBER");
  for (const rule of doc.keyRules) {
    lines.push(`- ${rule}`);
  }
  lines.push("");

  lines.push("REFERENCES — FORMAT GUIDE (Vancouver Style)");
  lines.push(doc.referencesGuide.intro);
  for (const ex of doc.referencesGuide.examples) {
    lines.push(`- ${ex}`);
  }
  if (doc.referencesGuide.seedReferences?.length) {
    lines.push("");
    lines.push("KEY REFERENCES FROM SYNOPSIS:");
    doc.referencesGuide.seedReferences.forEach((r, i) => {
      lines.push(`${i + 1}. ${r}`);
    });
  }
  lines.push("");

  if (doc.annexureTemplates.length > 0) {
    lines.push("ANNEXURE TEMPLATES");
    for (const a of doc.annexureTemplates) {
      lines.push(`ANNEXURE ${a.id} — ${a.title}`);
      if (a.templateContent) lines.push(a.templateContent);
      lines.push("");
    }
  }

  if (doc.literatureReferences && doc.literatureReferences.length > 0) {
    lines.push("LITERATURE REFERENCES (Topic Research)");
    lines.push(
      `${doc.literatureReferences.length} references collected via AI-assisted web search on thesis topic.`,
    );
    lines.push("| Sr.No | Vancouver Citation | Relevance |");
    lines.push("|-------|-------------------|-----------|");
    for (const ref of doc.literatureReferences) {
      const relevance = ref.relevanceNote ?? "—";
      lines.push(`| ${ref.serialNo} | ${ref.vancouverCitation} | ${relevance} |`);
    }
    lines.push("");
  }

  lines.push("### LOCKED RESEARCH CONTEXT");
  lines.push(doc.lockedResearchContext || "_No additional research notes provided._");

  return lines.join("\n");
}

export function buildFormattingRows(rules: Record<string, unknown>, fontNotes: string): Array<{ element: string; specification: string }> {
  return [
    { element: "Paper size", specification: String(rules.paper ?? "A4 (8.27\" x 11.69\"), 80-100 gsm bond paper") },
    { element: "Printing", specification: String(rules.printing ?? "Single side for submission copies") },
    { element: "Font — body text", specification: String(rules.font ?? fontNotes) },
    { element: "Font — Chapter titles", specification: String(rules.chapterFont ?? "Arial, Size 14, BOLD, ALL CAPS, Centered") },
    { element: "Line spacing — body", specification: String(rules.spacing ?? "1.5 line spacing") },
    { element: "Line spacing — abstract", specification: String(rules.abstractSpacing ?? "Single spacing (1.0)") },
    { element: "Margins", specification: String(rules.margins ?? "Left 1.5 inch, others 1 inch") },
    { element: "Preliminary page numbers", specification: String(rules.preliminaryPagination ?? "Roman numerals (i, ii, iii...) centered at bottom") },
    { element: "Main body page numbers", specification: String(rules.bodyPagination ?? "Arabic numerals (1, 2, 3...) centered at bottom") },
    { element: "Tables", specification: String(rules.tables ?? "Title ABOVE table — numbered Table 1, Table 2...") },
    { element: "Figures", specification: String(rules.figures ?? "Caption BELOW figure — numbered Figure 1, Figure 2...") },
    { element: "References", specification: String(rules.referencing ?? "Vancouver style, numbered as they appear in text") },
    { element: "Plagiarism", specification: String(rules.plagiarism ?? `Max ${rules.plagiarismMaxPercent ?? 10}% similarity before submission`) },
    {
      element: "Total pages (body only)",
      specification: `Minimum ${rules.pageLimitMin ?? 50} pages, Maximum ${rules.pageLimitMax ?? 150} pages`,
    },
  ];
}

export const DEFAULT_KEY_RULES = [
  "Each chapter MUST start on a new page",
  "All chapter titles: UPPERCASE, BOLD, CENTERED at top of page",
  "Tables and figures embedded inside Results with cross-references in text",
  "Abstract: reference-free, max 250 words, single-spaced",
  "References: Vancouver format, numbered as they appear in text (not alphabetical)",
  "Similarity/plagiarism check required before submission",
  "Candidate's name and thesis title must be identical across all certificate pages",
  "IEC approval number and date must be mentioned in Materials & Methods chapter",
  "Proforma/data collection sheet must be approved by IEC and attached as Annexure",
  "Master chart (patient data) to be included as last annexure",
];

export const DEFAULT_REFERENCES_GUIDE = {
  intro: "Number references in the order they first appear in the text. List them at end of thesis.",
  examples: [
    "Journal: Author AA, Author BB. Title. Journal. Year;Vol(Issue):pages.",
    "Book chapter: Author AA. Chapter title. In: Editor, ed. Book. City: Publisher; Year. p.pages.",
    "Online: Organization. Title [Internet]. Year. Available from: URL",
    "In-text: Superscript numbers: ...as reported previously.1,2",
  ],
};
