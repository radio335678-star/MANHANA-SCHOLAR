/**
 * Extract text context from dataset upload files (PDF/DOCX/images/spreadsheets).
 * Uses Kimi vision + file-extract for images/PDFs so all pages/content are read.
 */
import { extractSynopsisText } from "./synopsisExtract";
import { parseXlsx } from "./excelBuilder";
import { createKimiCompletion } from "./kimiModelRouter";
import { getKimiApiKey, getKimiBaseUrl } from "./kimiModels";
import { logger } from "./logger";

const MAX_EXTRACT_CHARS = 200_000;

function hasKimiKey(): boolean {
  return Boolean(getKimiApiKey());
}

function sheetSpecToText(spec: { name: string; columns: { header: string }[]; sampleRows?: Record<string, unknown>[] }): string {
  const headers = spec.columns.map((c) => c.header).join("\t");
  const rows = (spec.sampleRows ?? [])
    .slice(0, 200)
    .map((r) => spec.columns.map((c) => String(r[c.header] ?? "")).join("\t"))
    .join("\n");
  return `Sheet: ${spec.name}\n${headers}\n${rows}`.slice(0, MAX_EXTRACT_CHARS);
}

async function kimiExtractFromImage(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  if (!hasKimiKey()) {
    return `[Image: ${filename} — set KIMI_API_KEY to extract text]`;
  }
  try {
    const base64 = buffer.toString("base64");
    const { result } = await createKimiCompletion({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract ALL visible text, tables, column headers, and numeric data from this document image. Read every page/section. Preserve table structure with tabs between columns. Return plain text only.",
            },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
      max_tokens: 32768,
    });
    return (result.choices[0]?.message?.content ?? "").slice(0, MAX_EXTRACT_CHARS);
  } catch (err) {
    logger.warn({ err, filename }, "Kimi image extraction failed");
    return `[Image: ${filename} — extraction failed]`;
  }
}

async function kimiExtractFromDocument(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  if (!hasKimiKey()) {
    return `[Document: ${filename} — set KIMI_API_KEY to extract text]`;
  }
  const apiKey = getKimiApiKey();
  const baseUrl = getKimiBaseUrl();

  try {
    const form = new FormData();
    form.append("purpose", "file-extract");
    form.append("file", new Blob([buffer], { type: mimeType }), filename);

    const uploadRes = await fetch(`${baseUrl}/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!uploadRes.ok) {
      throw new Error(`File upload failed: ${uploadRes.status}`);
    }

    const uploaded = (await uploadRes.json()) as { id?: string };
    if (!uploaded.id) throw new Error("No file id returned");

    const contentRes = await fetch(`${baseUrl}/files/${uploaded.id}/content`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const text = contentRes.ok ? await contentRes.text() : "";

    await fetch(`${baseUrl}/files/${uploaded.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => undefined);

    if (text.trim()) return text.slice(0, MAX_EXTRACT_CHARS);

    return await kimiExtractFromImage(buffer, mimeType, filename);
  } catch (err) {
    logger.warn({ err, filename }, "Kimi document extraction failed");
    return `[Document: ${filename} — extraction failed]`;
  }
}

export async function extractDatasetContextText(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const lower = filename.toLowerCase();

  if (mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(lower)) {
    return kimiExtractFromImage(buffer, mimeType || "image/png", filename);
  }

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    return kimiExtractFromDocument(buffer, "application/pdf", filename);
  }

  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls")
  ) {
    try {
      const spec = await parseXlsx(buffer);
      return sheetSpecToText(spec);
    } catch {
      return `[Spreadsheet: ${filename}]`;
    }
  }

  if (lower.endsWith(".csv") || mimeType.includes("csv")) {
    return buffer.toString("utf-8").slice(0, MAX_EXTRACT_CHARS);
  }

  if (lower.endsWith(".doc") && !lower.endsWith(".docx")) {
    return kimiExtractFromDocument(buffer, mimeType || "application/msword", filename);
  }

  const synopsis = await extractSynopsisText(buffer, mimeType, filename);
  if (synopsis.startsWith("[PDF uploaded")) {
    return kimiExtractFromDocument(buffer, "application/pdf", filename);
  }

  return synopsis;
}
