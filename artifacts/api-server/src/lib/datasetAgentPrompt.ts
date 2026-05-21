import type OpenAI from "openai";
import type { WorkbookSpec } from "./sheetGeneration";
import type { DatasetContextBundle } from "./datasetContext";

export type DatasetAgentContext = {
  workspaceName: string;
  domain: string;
  chartName: string;
  chartMode: string;
  workbook: WorkbookSpec | null;
  contextBundle: Omit<DatasetContextBundle, "prompt" | "fullContext">;
  unresolvedIssues?: string[];
};

export function buildDatasetAgentSystemPrompt(ctx: DatasetAgentContext): string {
  const workbookBlock = ctx.workbook
    ? `Current workbook JSON (THIS is your source of truth — patch this, never regenerate from scratch unless asked):
${JSON.stringify(ctx.workbook, null, 2)}`
    : `No workbook exists yet. Use the \`build_from_context\` action via the prompt to generate the initial schema, then apply patches.`;

  const contextLine = [
    ctx.contextBundle.hasPreThesis ? "Pre-thesis locked" : "No pre-thesis yet",
    ctx.contextBundle.hasVault ? "Research vault files available" : "No vault files",
    ctx.contextBundle.hasUploads ? "Context uploads present" : "No context uploads",
  ].join(" | ");

  const issueBlock =
    ctx.unresolvedIssues?.length
      ? `\nValidation issues to fix:\n${ctx.unresolvedIssues.map((i) => `- ${i}`).join("\n")}`
      : "";

  return `You are the MANTHANA Dataset Agent — a world-class expert at designing clinical and research master chart Excel workbooks for Indian medical university theses (MD/MS/DM/MCh).

Your job is to help the scholar build a production-quality master chart dataset that perfectly matches their study design, protocol, and pre-thesis setup.

The scholar NEVER edits schema JSON manually. All changes go through your tools.

Workspace: ${ctx.workspaceName}
Domain: ${ctx.domain}
Chart: ${ctx.chartName} (mode: ${ctx.chartMode})
Context: ${contextLine}${issueBlock}

${workbookBlock}

TOOL USAGE RULES (follow in order):
1. Always call \`read_sheet_state\` first if the user asks about the current schema or wants to make incremental edits.
2. Use \`read_context_bundle\` when the user refers to their study design, synopsis, vault papers, or uploaded files.
3. Apply all schema changes using \`apply_sheet_patch\`. Use small, targeted patches — do not regenerate entire sheets unless the user explicitly asks.
4. After making changes, call \`validate_sheet\` to catch issues before committing.
5. Only call \`commit_version\` when the schema is correct and the user confirms (or asks to save). This writes XLSX to storage and creates a new version row.
6. NEVER emit raw JSON workbook specs in your assistant response text — use the tools.

EXCEL BEST PRACTICES:
- Column headers must be unique, concise (≤20 chars), and follow standard clinical nomenclature (e.g. "Age_yr", "BMI_kgm2", "HbA1c_%").
- Use type "number" for all numeric measurements, "date" for dates, "string" for categorical/free-text.
- Add validation options for categorical columns (e.g. Sex: ["M","F","Other"], Group: ["Case","Control"]).
- Each sheet name ≤31 chars, Excel-safe (no special characters).
- Split multi-group or multi-timepoint studies across separate sheets.
- Aim for 20–80 realistic sample rows that match the actual study data.

After every tool action, confirm what you changed in plain, friendly language.`;
}

const APPLY_PATCH_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "apply_sheet_patch",
    description:
      "Apply a structured, validated patch to the working workbook. Supports add/remove/rename columns, add/remove rows, add/remove sheets, set column validation, reorder columns, replace a sheet, or rename a sheet. Always prefer small targeted patches over full regeneration.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "add_columns", "remove_columns", "rename_column",
            "add_rows", "remove_rows",
            "add_sheet", "remove_sheet", "rename_sheet",
            "set_validation", "reorder_columns", "replace_sheet",
          ],
          description: "The type of patch to apply",
        },
        sheetIndex: {
          type: "number",
          description: "0-based index of the target sheet (default 0)",
        },
        columns: {
          type: "array",
          description: "For add_columns: array of { header, type, validation? }",
          items: {
            type: "object",
            properties: {
              header: { type: "string" },
              type: { type: "string", enum: ["string", "number", "date"] },
              validation: { type: "object" },
            },
            required: ["header", "type"],
          },
        },
        afterHeader: {
          type: "string",
          description: "For add_columns: insert after this column header",
        },
        headers: {
          type: "array",
          items: { type: "string" },
          description: "For remove_columns: headers to remove",
        },
        from: { type: "string", description: "For rename_column: current header" },
        to: { type: "string", description: "For rename_column: new header" },
        rows: {
          type: "array",
          description: "For add_rows: array of { header: value } row objects",
          items: { type: "object" },
        },
        indices: {
          type: "array",
          items: { type: "number" },
          description: "For remove_rows: 0-based row indices",
        },
        sheet: {
          type: "object",
          description: "For add_sheet / replace_sheet: full sheet spec { name, columns[], sampleRows? }",
        },
        name: { type: "string", description: "For rename_sheet: new sheet name" },
        header: { type: "string", description: "For set_validation: target column header" },
        validation: {
          type: "object",
          description: "For set_validation: { min?, max?, options? }",
        },
        order: {
          type: "array",
          items: { type: "string" },
          description: "For reorder_columns: desired header order",
        },
      },
      required: ["action"],
    },
  },
};

const READ_SHEET_STATE_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "read_sheet_state",
    description:
      "Read the current working workbook schema: all sheets, columns, row count, and basic stats. Call this before making any edits to understand the current state.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const READ_CONTEXT_BUNDLE_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "read_context_bundle",
    description:
      "Read the workspace context: locked pre-thesis setup, research vault sources, and uploaded context files. Use this when the user refers to their study design, methodology, or uploaded documents.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const VALIDATE_SHEET_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "validate_sheet",
    description:
      "Validate the current working workbook. Checks for duplicate headers, empty sheets, conflicting sheet names, and structural issues. Always call before commit_version.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const COMMIT_VERSION_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "commit_version",
    description:
      "Save the working workbook as a new versioned XLSX file. Writes to storage, mirrors to Research Vault, and creates a new version row. Only call after validate_sheet passes and the user is satisfied with the schema.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Short description of what changed in this version (shown in version history)",
        },
      },
      required: ["summary"],
    },
  },
};

export function buildDatasetAgentTools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return [
    READ_SHEET_STATE_TOOL,
    READ_CONTEXT_BUNDLE_TOOL,
    APPLY_PATCH_TOOL,
    VALIDATE_SHEET_TOOL,
    COMMIT_VERSION_TOOL,
    {
      type: "builtin_function",
      function: { name: "$rethink" },
    } as unknown as OpenAI.Chat.Completions.ChatCompletionTool,
  ];
}
