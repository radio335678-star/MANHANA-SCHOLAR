import { toFile } from "openai";
import type OpenAI from "openai";
import {
  createKimiClient,
  createKimiCompletionStreaming,
  type KimiStreamEvent,
} from "./kimiModelRouter";
import { getKimiApiKey, getKimiBaseUrl } from "./kimiModels";
import { logger } from "./logger";
import type { VisionFileInfo } from "@workspace/db";
import {
  isPdfFile,
  isPoorExtract,
  renderPdfPagesToPng,
} from "./pdfVisionPages";

// ── Constants ─────────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif", ".svg",
]);

const VIDEO_EXTS = new Set([".mp4", ".mpeg", ".mov", ".avi", ".webm", ".wmv", ".3gp"]);

const MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB — larger images use ms:// upload

const FILE_EXTRACT_POLL_MS = 500;
const FILE_EXTRACT_MAX_WAIT_MS = 60_000;

/** Max PDF pages sent as vision images across one batch (10 files). */
const MAX_PDF_VISION_PAGES_TOTAL = 30;
const MAX_PDF_PAGES_PER_FILE = 10;

export const DEFAULT_VISION_PROMPT = `You are a meticulous document reader. Examine every uploaded file in full detail.

For each file describe:
1. Document type, title, and overall structure
2. ALL text content — headings, body text, tables, labels, captions, footnotes — verbatim where relevant
3. ALL numerical data, measurements, dates, patient IDs, group labels
4. Tables: reproduce the complete table (headers + every row) in plain-text form
5. Charts / figures: describe the axes, legend, data series, and key values
6. Handwritten or scanned text: transcribe every legible character
7. Nothing should be omitted — if something is unclear state it but still describe it

Write a single cohesive report covering all files in order. Do NOT summarise; transcribe and describe completely.

OUTPUT LANGUAGE (mandatory): Write the entire report in English using Latin script only. Do NOT output Chinese characters (汉字), Japanese kanja, Korean hanja, or any CJK symbols — even when they appear in source documents. Transliterate personal names and describe non-English text in English.`;

/** Appended to every vision read (including custom prompts). */
const VISION_LANGUAGE_RULE =
  "\n\nReminder: Output must use English (Latin script) only — no Chinese/CJK characters or symbols in your response.";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileExt(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

function isImageFile(filename: string): boolean {
  return IMAGE_EXTS.has(fileExt(filename));
}

function isVideoFile(filename: string): boolean {
  return VIDEO_EXTS.has(fileExt(filename));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Moonshot Files API ────────────────────────────────────────────────────────

async function deleteMoonshotFile(fileId: string): Promise<void> {
  const apiKey = getKimiApiKey();
  const baseUrl = getKimiBaseUrl();
  if (!apiKey) return;
  await fetch(`${baseUrl}/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch(() => undefined);
}

/**
 * Poll until Moonshot file-extract content is available (or timeout).
 */
async function fetchMoonshotExtractedContent(fileId: string): Promise<string> {
  const apiKey = getKimiApiKey();
  const baseUrl = getKimiBaseUrl();
  if (!apiKey) throw new Error("KIMI_API_KEY not configured");

  const deadline = Date.now() + FILE_EXTRACT_MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const contentRes = await fetch(`${baseUrl}/files/${fileId}/content`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (contentRes.ok) {
      const text = await contentRes.text();
      if (text.trim()) return text;
    }

    // Check processing status
    const metaRes = await fetch(`${baseUrl}/files/${fileId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (metaRes.ok) {
      const meta = (await metaRes.json()) as { status?: string };
      if (meta.status === "error") {
        throw new Error(`Moonshot file processing failed for ${fileId}`);
      }
    }

    await sleep(FILE_EXTRACT_POLL_MS);
  }

  return "";
}

/** Upload for PDF/DOCX/XLSX etc. — Moonshot extracts content server-side. */
async function uploadDocForExtract(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const client = createKimiClient();
  const f = await toFile(buffer, filename, { type: mimeType });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uploaded = await (client.files as any).create({
    file: f,
    purpose: "file-extract",
  });
  return uploaded.id as string;
}

/** Upload image for native vision — reference via ms:// in image_url. */
async function uploadImageForVision(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const client = createKimiClient();
  const f = await toFile(buffer, filename, { type: mimeType });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uploaded = await (client.files as any).create({
    file: f,
    purpose: "image",
  });
  return uploaded.id as string;
}

/** Upload video for native vision — reference via ms:// in video_url. */
async function uploadVideoForVision(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const client = createKimiClient();
  const f = await toFile(buffer, filename, { type: mimeType });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uploaded = await (client.files as any).create({
    file: f,
    purpose: "video",
  });
  return uploaded.id as string;
}

// ── Core vision runner ────────────────────────────────────────────────────────

export type VisionRunResult = {
  text: string;
  thinkingText: string;
  tokensUsed: number;
  modelUsed: string;
  fileRefs: VisionFileInfo[];
};

type UserContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } };

function pageCapPerPdf(pdfFileCount: number): number {
  if (pdfFileCount <= 0) return MAX_PDF_PAGES_PER_FILE;
  return Math.min(
    MAX_PDF_PAGES_PER_FILE,
    Math.max(1, Math.floor(MAX_PDF_VISION_PAGES_TOTAL / pdfFileCount)),
  );
}

export async function runVisionRead({
  files,
  prompt,
  onStream,
}: {
  files: Array<{ buffer: Buffer; name: string; mimeType: string }>;
  prompt: string;
  onStream?: (event: KimiStreamEvent) => void;
}): Promise<VisionRunResult> {
  const pdfFileCount = files.filter((f) => isPdfFile(f.name, f.mimeType)).length;
  const perPdfPageCap = pageCapPerPdf(pdfFileCount);

  type FileProcessResult = {
    systemMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    userParts: UserContentPart[];
    fileRef: VisionFileInfo;
  };

  const processOneFile = async (f: {
    buffer: Buffer;
    name: string;
    mimeType: string;
  }): Promise<FileProcessResult | null> => {
    const ext = fileExt(f.name);
    const empty: FileProcessResult = {
      systemMessages: [],
      userParts: [],
      fileRef: { name: f.name, size: f.buffer.length, mimeType: f.mimeType },
    };

    try {
      if (isVideoFile(f.name)) {
        const fileId = await uploadVideoForVision(f.buffer, f.name, f.mimeType);
        logger.info({ filename: f.name, fileId, ext }, "Vision: uploaded video (ms://)");
        return {
          systemMessages: [],
          userParts: [{ type: "video_url", video_url: { url: `ms://${fileId}` } }],
          fileRef: { ...empty.fileRef, kimiFileId: fileId },
        };
      }

      if (isImageFile(f.name)) {
        if (f.buffer.length <= MAX_INLINE_IMAGE_BYTES) {
          const b64 = f.buffer.toString("base64");
          logger.info({ filename: f.name, bytes: f.buffer.length }, "Vision: inline image");
          return {
            systemMessages: [],
            userParts: [{
              type: "image_url",
              image_url: { url: `data:${f.mimeType};base64,${b64}` },
            }],
            fileRef: empty.fileRef,
          };
        }
        const fileId = await uploadImageForVision(f.buffer, f.name, f.mimeType);
        logger.info({ filename: f.name, fileId, ext }, "Vision: uploaded image (ms://)");
        return {
          systemMessages: [],
          userParts: [{ type: "image_url", image_url: { url: `ms://${fileId}` } }],
          fileRef: { ...empty.fileRef, kimiFileId: fileId },
        };
      }

      // PDF, DOCX, XLSX, etc. — try Moonshot file-extract first
      const fileId = await uploadDocForExtract(f.buffer, f.name, f.mimeType);
      const extracted = await fetchMoonshotExtractedContent(fileId);
      await deleteMoonshotFile(fileId);

      const header = `=== Document: ${f.name} ===`;
      const pdf = isPdfFile(f.name, f.mimeType);
      const scanned = pdf && isPoorExtract(extracted);

      if (scanned) {
        // Scanned/image-only PDF: rasterize pages → Kimi vision (true "reads what it sees")
        const pageImages = await renderPdfPagesToPng(f.buffer, f.name, perPdfPageCap);
        if (pageImages.length === 0) {
          throw new Error(`Could not render PDF pages for ${f.name}`);
        }

        const parts: UserContentPart[] = [];
        for (let i = 0; i < pageImages.length; i++) {
          const b64 = pageImages[i]!.toString("base64");
          parts.push({
            type: "text",
            text: `[Scanned PDF: ${f.name} — page ${i + 1} of ${pageImages.length}]`,
          });
          parts.push({
            type: "image_url",
            image_url: { url: `data:image/png;base64,${b64}` },
          });
        }

        logger.info(
          { filename: f.name, ext, pages: pageImages.length, perPdfPageCap },
          "Vision: scanned PDF sent as page images to Kimi vision",
        );

        return {
          systemMessages: [],
          userParts: parts,
          fileRef: { ...empty.fileRef, kimiFileId: fileId },
        };
      }

      logger.info(
        { filename: f.name, fileId, ext, chars: extracted.length },
        "Vision: document extracted via Moonshot file-extract",
      );

      return {
        systemMessages: [{
          role: "system",
          content: extracted.trim()
            ? `${header}\n${extracted}`
            : `${header}\n[Content could not be extracted — describe any limitations if relevant.]`,
        }],
        userParts: [],
        fileRef: { ...empty.fileRef, kimiFileId: fileId },
      };
    } catch (uploadErr) {
      logger.warn({ err: uploadErr, filename: f.name }, "Vision: file processing failed — skipped");
      return empty;
    }
  };

  // Parallel uploads, preserve user file order
  const ordered = await Promise.all(
    files.map((f, index) => processOneFile(f).then((r) => ({ index, r }))),
  );
  ordered.sort((a, b) => a.index - b.index);

  const systemMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  const userParts: UserContentPart[] = [];
  const fileRefs: VisionFileInfo[] = [];

  for (const { r } of ordered) {
    if (!r) continue;
    systemMessages.push(...r.systemMessages);
    userParts.push(...r.userParts);
    fileRefs.push(r.fileRef);
  }

  if (systemMessages.length === 0 && userParts.length === 0) {
    throw new Error("No files could be processed. Check that file types are supported.");
  }

  const effectivePrompt = `${prompt.trim()}${VISION_LANGUAGE_RULE}`;

  const hasVisualParts = userParts.length > 0;
  const userMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = hasVisualParts
    ? {
        role: "user",
        content: [
          ...userParts,
          { type: "text", text: effectivePrompt },
        ] as OpenAI.Chat.Completions.ChatCompletionContentPart[],
      }
    : { role: "user", content: effectivePrompt };

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    ...systemMessages,
    userMessage,
  ];

  let thinkingText = "";

  const wrappedOnStream: (event: KimiStreamEvent) => void = (event) => {
    if (event.type === "thinking") thinkingText += event.content;
    onStream?.(event);
  };

  const result = await createKimiCompletionStreaming(
    {
      model: process.env.KIMI_VISION_MODEL ?? process.env.KIMI_PRIMARY_MODEL ?? "kimi-k2.6",
      messages,
      max_tokens: 8192,
      // Thinking streams into reasoning_content, not content — Vision Reader UI only renders content tokens.
      thinking: { type: "disabled" },
    },
    wrappedOnStream,
  );

  const message = result.result.choices[0]?.message;
  const contentText = message?.content ?? "";
  const reasoningText =
    (message as { reasoning_content?: string } | undefined)?.reasoning_content ?? "";
  const text =
    contentText.trim() ||
    reasoningText.trim() ||
    thinkingText.trim();
  const tokensUsed = result.result.usage?.total_tokens ?? 0;

  return { text, thinkingText, tokensUsed, modelUsed: result.modelUsed, fileRefs };
}
