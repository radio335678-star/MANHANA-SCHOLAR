/**
 * Rasterize PDF pages to PNG for Kimi vision when file-extract returns poor OCR.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { logger } from "./logger";

const require = createRequire(import.meta.url);

const PDF_RENDER_SCALE = 1.75;
const MAX_PDF_PAGES_PER_FILE = 10;

let pdfjsModule: typeof import("pdfjs-dist/legacy/build/pdf.mjs") | null = null;

function pdfjsPaths() {
  const distDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
  return {
    cMapUrl: path.join(distDir, "cmaps/"),
    standardFontDataUrl: path.join(distDir, "standard_fonts/"),
  };
}

async function loadPdfJs() {
  if (!pdfjsModule) {
    pdfjsModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfjsModule;
}

/** True when Moonshot file-extract text is empty, failed, or unusable (scanned PDF). */
export function isPoorExtract(extractedText: string): boolean {
  const unwrappedText = (() => {
    const t = extractedText.trim();
    if (t.startsWith("{") && t.includes('"content"')) {
      try {
        const parsed = JSON.parse(t) as { content?: string };
        if (typeof parsed.content === "string") return parsed.content;
      } catch {
        /* not JSON */
      }
    }
    return t;
  })();

  const usableChars = unwrappedText
    .replace(/\[.*?\]/g, "")
    .replace(/extraction failed/gi, "")
    .trim().length;

  return (
    usableChars < 300 ||
    extractedText.includes("extraction failed") ||
    (usableChars > 500 &&
      (unwrappedText.match(/ /g)?.length ?? 0) / Math.max(unwrappedText.length, 1) < 0.02) ||
    (usableChars > 2000 && (unwrappedText.match(/\n/g)?.length ?? 0) < 5)
  );
}

export function isPdfFile(filename: string, mimeType: string): boolean {
  return mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
}

/**
 * Render up to maxPages PDF pages as PNG buffers (for Kimi image_url vision).
 */
export async function renderPdfPagesToPng(
  buffer: Buffer,
  filename: string,
  maxPages: number = MAX_PDF_PAGES_PER_FILE,
): Promise<Buffer[]> {
  const { getDocument } = await loadPdfJs();
  const { cMapUrl, standardFontDataUrl } = pdfjsPaths();

  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    cMapUrl,
    cMapPacked: true,
    standardFontDataUrl,
    useSystemFonts: true,
  });

  const pdfDocument = await loadingTask.promise;
  const totalPages = pdfDocument.numPages;
  const pageCount = Math.min(totalPages, maxPages);
  const outputs: Buffer[] = [];

  try {
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      // pdfjs Node canvas factory (typed loosely — provided at runtime by pdfjs-dist)
      const canvasFactory = pdfDocument.canvasFactory as {
        create: (w: number, h: number) => { canvas: { toBuffer: (fmt: string) => Buffer }; context: CanvasRenderingContext2D };
      };
      const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
      const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);

      await page.render({
        canvas: canvasAndContext.canvas as unknown as HTMLCanvasElement,
        canvasContext: canvasAndContext.context,
        viewport,
      }).promise;

      const png = canvasAndContext.canvas.toBuffer("image/png");
      outputs.push(Buffer.from(png));
      page.cleanup();
    }
  } finally {
    await pdfDocument.destroy();
  }

  logger.info(
    { filename, renderedPages: outputs.length, totalPages },
    "Vision: rasterized scanned PDF pages for Kimi vision",
  );

  return outputs;
}
