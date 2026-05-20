import OpenAI from "openai";
import { createKimiCompletion } from "./kimiModelRouter";
import { hasKimiKey } from "./kimiTools";
import { logger } from "./logger";

export type ExportFormat = "pdf" | "docx" | "xlsx";

export const CODE_RUNNER_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "code_runner",
    description:
      "Executes Python code in a secure sandbox. Use reportlab for PDF, python-docx for DOCX, and openpyxl for Excel. Output files as Base64 JSON on stdout.",
  },
};

const CODE_RUNNER_SYSTEM_PROMPT = `You are an expert document designer for Indian medical thesis exports.
You MUST use the code_runner tool for every document generation request.

Inside your Python script:
1. Generate the file and save it locally in the sandbox (e.g. output.pdf).
2. Open the file in binary read mode ('rb').
3. Encode the binary data to Base64.
4. Print ONLY a JSON object to standard output in this exact format:
   {"filename":"output.pdf","file_data_base64":"<the_base64_string>"}
Do not print any other debugging text.

Library requirements by format:
- PDF: reportlab with coordinate-based layout, Times New Roman or Helvetica, 1-inch margins, page numbers in footer.
- DOCX: python-docx with custom paragraph styles, justified body text, heading hierarchy.
- XLSX: openpyxl with formatted headers, frozen top row, auto column widths.

Brand color: #1A365D (RGB 26, 54, 93) for headings and accents.`;

const MAX_CODE_RUNNER_ROUNDS = 12;

export type GeneratedFile = {
  buffer: Buffer;
  filename: string;
  modelUsed?: string;
};

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compileThesisExportText(params: {
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
  } | null;
  sections: Array<{ title: string; content?: string | null; order?: number | null }>;
}): string {
  const { workspace, userProfile, sections } = params;
  const lines: string[] = [
    `# ${workspace.title}`,
    "",
    `Qualification: ${workspace.qualification ?? userProfile?.qualification ?? "PG"}`,
    `Domain: ${workspace.domain ?? ""}`,
    `Candidate: ${workspace.candidateName ?? userProfile?.fullName ?? ""}`,
    `Guide: ${workspace.guideName ?? ""}`,
    `College: ${workspace.collegeName ?? userProfile?.collegeName ?? ""}`,
    `University: ${workspace.universityName ?? userProfile?.universityName ?? ""}`,
    "",
    "---",
    "",
  ];

  for (const section of sections) {
    lines.push(`## ${section.title}`, "");
    const body = section.content ? stripHtml(section.content) : `[${section.title} — content not yet written]`;
    lines.push(body, "", "---", "");
  }

  return lines.join("\n").slice(0, 180_000);
}

function libraryForFormat(format: ExportFormat): string {
  switch (format) {
    case "pdf":
      return "reportlab";
    case "docx":
      return "python-docx";
    case "xlsx":
      return "openpyxl";
  }
}

function defaultFilename(format: ExportFormat, title: string): string {
  const slug = title.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "thesis";
  switch (format) {
    case "pdf":
      return `${slug}.pdf`;
    case "docx":
      return `${slug}.docx`;
    case "xlsx":
      return `${slug}.xlsx`;
  }
}

function extractBase64Payload(text: string): { filename: string; file_data_base64: string } | null {
  if (!text?.trim()) return null;

  const jsonMatch = text.match(/\{[\s\S]*"file_data_base64"[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      filename?: string;
      file_data_base64?: string;
    };
    if (parsed.file_data_base64) {
      return {
        filename: parsed.filename ?? "output.bin",
        file_data_base64: parsed.file_data_base64,
      };
    }
  } catch {
    // fall through
  }

  return null;
}

function decodeGeneratedFile(
  payload: { filename: string; file_data_base64: string },
  format: ExportFormat,
  title: string,
): GeneratedFile {
  return {
    buffer: Buffer.from(payload.file_data_base64, "base64"),
    filename: payload.filename || defaultFilename(format, title),
  };
}

export async function generateDocumentViaCodeRunner(params: {
  format: ExportFormat;
  thesisTitle: string;
  exportText: string;
  extraInstructions?: string;
}): Promise<GeneratedFile> {
  if (!hasKimiKey()) {
    throw new Error("AI export is not configured. Set KIMI_API_KEY.");
  }

  const library = libraryForFormat(params.format);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: CODE_RUNNER_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Use code_runner and ${library} to generate a premium ${params.format.toUpperCase()} thesis document.

Thesis title: ${params.thesisTitle}
${params.extraInstructions ? `\nAdditional instructions:\n${params.extraInstructions}\n` : ""}

Thesis content (Markdown):
${params.exportText}`,
    },
  ];

  let modelUsed: string | undefined;
  let lastPayload: { filename: string; file_data_base64: string } | null = null;

  for (let round = 0; round < MAX_CODE_RUNNER_ROUNDS; round++) {
    const { result: response, modelUsed: usedModel } = await createKimiCompletion({
      messages,
      tools: [CODE_RUNNER_TOOL],
      tool_choice: "auto",
      max_tokens: 16384,
      thinking: { type: "enabled" },
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
      thinking?: { type: "enabled" | "disabled" };
    });
    modelUsed = usedModel;

    const msg = response.choices[0]?.message;
    if (!msg) break;

    if (msg.content) {
      const fromContent = extractBase64Payload(msg.content);
      if (fromContent) {
        lastPayload = fromContent;
        break;
      }
    }

    const toolCalls = msg.tool_calls;
    if (!toolCalls?.length) break;

    messages.push({
      role: "assistant",
      content: msg.content ?? "",
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      const fn =
        "function" in tc
          ? tc.function
          : (tc as { function: { name: string; arguments: string } }).function;
      let toolContent = fn.arguments || "{}";

      if (fn.name === "code_runner") {
        const fromArgs = extractBase64Payload(toolContent);
        if (fromArgs) {
          lastPayload = fromArgs;
        }
        toolContent = JSON.stringify({ ok: true, status: "code_runner_executed" });
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: toolContent,
      });

      const fromTool = extractBase64Payload(toolContent);
      if (fromTool) {
        lastPayload = fromTool;
      }
    }

    if (lastPayload) break;
  }

  if (!lastPayload) {
    logger.warn({ format: params.format, title: params.thesisTitle }, "code_runner did not return Base64 payload");
    throw new Error(`Failed to generate ${params.format.toUpperCase()} via Kimi code_runner sandbox`);
  }

  const file = decodeGeneratedFile(lastPayload, params.format, params.thesisTitle);
  return { ...file, modelUsed };
}
