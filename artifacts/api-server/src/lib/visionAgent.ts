import { toFile } from "openai";
import {
  createKimiClient,
  createKimiCompletionStreaming,
  type KimiStreamEvent,
} from "./kimiModelRouter";
import { logger } from "./logger";
import type { VisionFileInfo } from "@workspace/db";

// ── Constants ─────────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif",
]);

const MAX_INLINE_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB — larger images go via Files API

export const DEFAULT_VISION_PROMPT = `You are a meticulous document reader. Examine every uploaded file in full detail.

For each file describe:
1. Document type, title, and overall structure
2. ALL text content — headings, body text, tables, labels, captions, footnotes — verbatim where relevant
3. ALL numerical data, measurements, dates, patient IDs, group labels
4. Tables: reproduce the complete table (headers + every row) in plain-text form
5. Charts / figures: describe the axes, legend, data series, and key values
6. Handwritten or scanned text: transcribe every legible character
7. Nothing should be omitted — if something is unclear state it but still describe it

Write a single cohesive report covering all files in order. Do NOT summarise; transcribe and describe completely.`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileExt(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

function isImageFile(filename: string): boolean {
  return IMAGE_EXTS.has(fileExt(filename));
}

// ── Moonshot Files API ────────────────────────────────────────────────────────

/**
 * Upload a document buffer to the Moonshot Files API.
 * Returns the remote file_id for use in chat messages.
 */
export async function uploadDocToMoonshot(
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

// ── Core vision runner ────────────────────────────────────────────────────────

export type VisionRunResult = {
  text: string;
  thinkingText: string;
  tokensUsed: number;
  modelUsed: string;
  fileRefs: VisionFileInfo[];
};

export async function runVisionRead({
  files,
  prompt,
  onStream,
}: {
  files: Array<{ buffer: Buffer; name: string; mimeType: string }>;
  prompt: string;
  onStream?: (event: KimiStreamEvent) => void;
}): Promise<VisionRunResult> {
  // Build ordered content parts one file at a time to preserve document order
  type ContentPart =
    | { type: "image_url"; image_url: { url: string } }
    | { type: "file"; file: { file_id: string } };

  const parts: ContentPart[] = [];
  const fileRefs: VisionFileInfo[] = [];

  for (const f of files) {
    const ext = fileExt(f.name);
    const image = isImageFile(f.name);

    if (image && f.buffer.length <= MAX_INLINE_IMAGE_BYTES) {
      // Send image inline as base64 for true visual understanding
      const b64 = f.buffer.toString("base64");
      parts.push({
        type: "image_url",
        image_url: { url: `data:${f.mimeType};base64,${b64}` },
      });
      fileRefs.push({ name: f.name, size: f.buffer.length, mimeType: f.mimeType });
      logger.info({ filename: f.name, bytes: f.buffer.length }, "Vision: inline image");
    } else {
      // Documents (PDF, DOCX, XLSX, …) and large images → Files API
      try {
        const fileId = await uploadDocToMoonshot(f.buffer, f.name, f.mimeType);
        parts.push({ type: "file", file: { file_id: fileId } });
        fileRefs.push({
          name: f.name,
          size: f.buffer.length,
          mimeType: f.mimeType,
          kimiFileId: fileId,
        });
        logger.info({ filename: f.name, fileId, ext }, "Vision: uploaded to Moonshot Files API");
      } catch (uploadErr) {
        logger.warn(
          { err: uploadErr, filename: f.name },
          "Vision: Files API upload failed — file skipped",
        );
        fileRefs.push({ name: f.name, size: f.buffer.length, mimeType: f.mimeType });
      }
    }
  }

  if (parts.length === 0) {
    throw new Error("No files could be processed. Check that file types are supported.");
  }

  let thinkingText = "";

  const wrappedOnStream: (event: KimiStreamEvent) => void = (event) => {
    if (event.type === "thinking") thinkingText += event.content;
    onStream?.(event);
  };

  const result = await createKimiCompletionStreaming(
    {
      // model is controlled by the fallback chain; vision model can be set via KIMI_VISION_MODEL
      model: process.env.KIMI_VISION_MODEL ?? process.env.KIMI_PRIMARY_MODEL ?? "kimi-k2.6",
      messages: [
        {
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [...parts, { type: "text" as const, text: prompt }] as any,
        },
      ],
      max_tokens: 8192,
      thinking: { type: "enabled" },
    },
    wrappedOnStream,
  );

  const text = result.result.choices[0]?.message.content ?? "";
  const tokensUsed = result.result.usage?.total_tokens ?? 0;

  return { text, thinkingText, tokensUsed, modelUsed: result.modelUsed, fileRefs };
}
