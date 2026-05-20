import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  WidthType,
  BorderStyle,
} from "docx";
import type { PreThesisDocumentV2 } from "../types/preThesisDocumentV2";
import { compilePreThesisMdV2 } from "./preThesisCompilerV2";

function cell(text: string, bold = false): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold, font: "Arial", size: 22 })] })],
  });
}

export async function exportPreThesisDocx(doc: PreThesisDocumentV2): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text: `${doc.header.degreeTitle} — PRE-REFERENCE STRUCTURE FILE`,
          bold: true,
          font: "Arial",
          size: 28,
        }),
      ],
    }),
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${doc.header.universityName ?? ""} | ${doc.header.universityOrdinances}`,
          font: "Arial",
          size: 22,
        }),
      ],
    }),
  );

  const meta = [
    doc.header.candidateName && `Candidate: ${doc.header.candidateName}`,
    doc.header.guideName && `Guide: ${doc.header.guideName}`,
    doc.header.coGuideName && `Co-Guide: ${doc.header.coGuideName}`,
    doc.header.departmentName && `Dept: ${doc.header.departmentName}`,
    doc.header.collegeName,
    doc.header.state,
  ]
    .filter(Boolean)
    .join("  |  ");

  if (meta) {
    children.push(new Paragraph({ children: [new TextRun({ text: meta, font: "Arial", size: 20 })] }));
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "PART A — PRELIMINARY PAGES", bold: true, font: "Arial" })],
    }),
  );

  const partARows = [
    new TableRow({ children: [cell("#", true), cell("Page", true), cell("Content", true)] }),
    ...doc.partA.preliminaryPages.map((p) =>
      new TableRow({ children: [cell(p.page), cell(p.title), cell(p.content)] }),
    ),
  ];
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: partARows,
    }),
  );

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "PART B — MAIN BODY", bold: true, font: "Arial" })],
    }),
  );

  const partBRows = [
    new TableRow({
      children: [cell("Chapter", true), cell("Title", true), cell("Pages", true)],
    }),
    ...doc.partB.chapters.map((c) =>
      new TableRow({
        children: [
          cell(c.chapter),
          cell(c.title),
          cell(
            c.minPages != null && c.maxPages != null ? `${c.minPages}–${c.maxPages}` : "—",
          ),
        ],
      }),
    ),
  ];
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: partBRows }));

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "FORMATTING SPECIFICATIONS", bold: true, font: "Arial" })],
    }),
  );

  const fmtRows = [
    new TableRow({ children: [cell("Element", true), cell("Specification", true)] }),
    ...doc.formattingSpecs.rows.map((r) =>
      new TableRow({ children: [cell(r.element), cell(r.specification)] }),
    ),
  ];
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: fmtRows }));

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "CHAPTER BLUEPRINTS", bold: true, font: "Arial" })],
    }),
  );

  for (const bp of doc.chapterBlueprints) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${bp.chapter} — ${bp.title}`, bold: true, font: "Arial", size: 24 }),
        ],
      }),
    );
    for (const bullet of bp.bullets) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${bullet}`, font: "Arial", size: 22 })],
        }),
      );
    }
  }

  const document = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(document);
}

export { compilePreThesisMdV2 };

export async function exportPreThesisDocxFromMd(md: string, title: string): Promise<Buffer> {
  const lines = md.split("\n");
  const children = lines.map(
    (line) =>
      new Paragraph({
        children: [
          new TextRun({
            text: line || " ",
            font: "Arial",
            size: line.startsWith("#") || line.startsWith("PART") ? 24 : 22,
            bold: line.startsWith("#") || line.startsWith("PART") || line.includes("—"),
          }),
        ],
      }),
  );

  const document = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun({ text: title, bold: true, font: "Arial" })],
          }),
          ...children,
        ],
      },
    ],
  });

  return Packer.toBuffer(document);
}
