import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  TableOfContents,
  StyleLevel,
  convertInchesToTwip,
  ShadingType,
} from "docx";
import type { sectionsTable } from "@workspace/db";
import { analyzeCoherence } from "./sectionCoherence";
import type { VaultCitationCatalog } from "@workspace/vault-citations";
import { expandVaultCitationsInText } from "@workspace/vault-citations";

function stripHtml(html: string): string {
  return html
    .replace(/<mark[^>]*>(.*?)<\/mark>/gi, "[$1]")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "$1")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function htmlToParagraphs(html: string | null, sectionTitle: string): Paragraph[] {
  if (!html?.trim()) {
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: `[${sectionTitle} — content not yet written]`,
            italics: true,
            color: "888888",
          }),
        ],
        spacing: { after: 200 },
      }),
    ];
  }

  const paragraphs: Paragraph[] = [];
  const blocks = html.split(/<\/p>/i).filter(Boolean);

  for (const block of blocks) {
    const isHighlight = /class="thesis-highlight"/i.test(block);
    const text = stripHtml(block);
    if (!text) continue;

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text,
            size: 24,
            highlight: isHighlight ? "yellow" : undefined,
            shading: isHighlight
              ? { type: ShadingType.CLEAR, fill: "FFF9C4" }
              : undefined,
          }),
        ],
        spacing: { after: 200, line: 480 },
        alignment: AlignmentType.JUSTIFIED,
      }),
    );
  }

  return paragraphs.length ? paragraphs : htmlToParagraphs(null, sectionTitle);
}

export async function exportPremiumThesisDocx(params: {
  workspace: {
    title: string;
    domain?: string | null;
    qualification?: string | null;
    candidateName?: string | null;
    guideName?: string | null;
    collegeName?: string | null;
    universityName?: string | null;
  };
  userProfile?: {
    fullName?: string | null;
    collegeName?: string | null;
    universityName?: string | null;
    qualification?: string | null;
    domain?: string | null;
  } | null;
  sections: Array<typeof sectionsTable.$inferSelect>;
  vaultCatalog: VaultCitationCatalog;
}): Promise<Buffer> {
  const { workspace, userProfile, sections, vaultCatalog } = params;
  const today = new Date().toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const coherence = analyzeCoherence(
    sections.map((s) => ({ title: s.title, content: s.content })),
    vaultCatalog,
  );

  const children: Paragraph[] = [];

  // Title page
  children.push(
    new Paragraph({
      children: [new TextRun({ text: workspace.title, bold: true, size: 36 })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 1440, after: 480 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `A Thesis Submitted for ${workspace.qualification ?? userProfile?.qualification ?? "Post-Graduate Degree"}`,
          size: 24,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: workspace.domain ?? userProfile?.domain ?? "",
          size: 24,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
    }),
  );

  const candidate = workspace.candidateName ?? userProfile?.fullName;
  if (candidate) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Candidate: ${candidate}`, size: 24 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
      }),
    );
  }
  if (workspace.guideName) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Guide: ${workspace.guideName}`, size: 24 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
      }),
    );
  }

  const college = workspace.collegeName ?? userProfile?.collegeName;
  const university = workspace.universityName ?? userProfile?.universityName;
  if (college) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: college, size: 24, bold: true })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
      }),
    );
  }
  if (university) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: university, size: 24 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 },
      }),
    );
  }

  children.push(
    new Paragraph({
      children: [new TextRun({ text: today, size: 22, color: "555555" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 720 },
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // Table of contents
  children.push(
    new Paragraph({
      text: "Table of Contents",
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 240 },
    }),
    new TableOfContents("Table of Contents", {
      hyperlink: true,
      headingStyleRange: "1-3",
      stylesWithLevels: [
        new StyleLevel("Heading1", 1),
        new StyleLevel("Heading2", 2),
        new StyleLevel("Heading3", 3),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // List of abbreviations
  const abbrEntries = Object.entries(coherence.abbreviationMap);
  if (abbrEntries.length > 0) {
    children.push(
      new Paragraph({
        text: "List of Abbreviations",
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 240 },
      }),
    );
    for (const [abbr, expansion] of abbrEntries) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: abbr, bold: true, size: 24 }),
            new TextRun({ text: ` — ${expansion}`, size: 24 }),
          ],
          spacing: { after: 80 },
        }),
      );
    }
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Main sections
  for (const section of sections) {
    const expandedHtml = section.content
      ? expandVaultCitationsInText(stripHtml(section.content), vaultCatalog)
      : null;

    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 480, after: 240 },
      }),
      ...htmlToParagraphs(expandedHtml, section.title),
      new Paragraph({ children: [new PageBreak()] }),
    );
  }

  // Bibliography from vault citations used
  if (coherence.citedKeys.length > 0) {
    children.push(
      new Paragraph({
        text: "Bibliography",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 480, after: 240 },
      }),
    );
    for (const key of coherence.citedKeys.sort()) {
      const entry = vaultCatalog[key];
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: entry?.bibliographyLine ?? `[${key}] — see Research Vault`,
              size: 22,
            }),
          ],
          spacing: { after: 120 },
        }),
      );
    }
  }

  const doc = new Document({
    creator: "MANTHANA-SCHOLER",
    title: workspace.title,
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman", size: 24 },
          paragraph: { spacing: { line: 480 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.25),
              right: convertInchesToTwip(1),
            },
            pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [new TextRun({ text: workspace.title, size: 20, color: "666666" })],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Page ", size: 20 }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 20 }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
