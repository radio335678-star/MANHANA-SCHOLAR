/**
 * Best-effort text extraction from synopsis uploads (DOCX/TXT).
 */
import AdmZip from "adm-zip";

export async function extractSynopsisText(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const lower = filename.toLowerCase();

  if (mimeType === "text/plain" || lower.endsWith(".txt") || lower.endsWith(".md")) {
    return buffer.toString("utf-8").slice(0, 100_000);
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    return extractDocxText(buffer);
  }

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    return "[PDF uploaded — paste synopsis text in Research Notes or re-upload as DOCX for full blueprint extraction]";
  }

  return buffer.toString("utf-8").slice(0, 50_000);
}

function extractDocxText(buffer: Buffer): string {
  try {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry("word/document.xml");
    if (!entry) return "";
    const xml = entry.getData().toString("utf-8");

    const parts: string[] = [];
    const bodyMatch = xml.match(/<w:body[^>]*>([\s\S]*)<\/w:body>/);
    const body = bodyMatch?.[1] ?? xml;

    const blocks = body.split(/(?=<w:tbl)/);
    for (const block of blocks) {
      if (block.includes("<w:tbl")) {
        parts.push(extractDocxTable(block));
      } else {
        parts.push(extractDocxParagraphs(block));
      }
    }

    return parts
      .filter(Boolean)
      .join("\n\n")
      .replace(/\n{3,}/g, "\n\n")
      .slice(0, 120_000);
  } catch {
    return "";
  }
}

function extractDocxParagraphs(xml: string): string {
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(Number(n)))
    .trim();
}

function extractDocxTable(tblXml: string): string {
  const rows: string[][] = [];
  const rowMatches = tblXml.match(/<w:tr[\s\S]*?<\/w:tr>/g) ?? [];
  for (const rowXml of rowMatches) {
    const cells: string[] = [];
    const cellMatches = rowXml.match(/<w:tc[\s\S]*?<\/w:tc>/g) ?? [];
    for (const cellXml of cellMatches) {
      const text = cellXml
        .replace(/<\/w:p>/g, " ")
        .replace(/<w:tab[^>]*\/>/g, "\t")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
      cells.push(text);
    }
    if (cells.some((c) => c.length > 0)) rows.push(cells);
  }
  if (rows.length === 0) return extractDocxParagraphs(tblXml);
  return rows.map((r) => r.join("\t")).join("\n");
}
