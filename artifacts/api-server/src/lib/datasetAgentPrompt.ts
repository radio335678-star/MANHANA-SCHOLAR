import type OpenAI from "openai";
import type { WorkbookSpec } from "./sheetGeneration";
import type { DatasetAgentContextBundle } from "./datasetContext";

export type DatasetAgentPromptContext = {
  chartName: string;
  chartMode: string;
  workbook: WorkbookSpec | null;
  ctx: DatasetAgentContextBundle;
};

export function buildDatasetAgentSystemPrompt(p: DatasetAgentPromptContext): string {
  const { chartName, chartMode, workbook, ctx } = p;

  const workbookBlock = workbook
    ? `=== CURRENT WORKBOOK (your live source of truth — patch this, never regenerate from scratch unless asked) ===
${JSON.stringify(workbook, null, 2)}`
    : `No workbook exists yet. You must create it using apply_sheet_patch with action="add_sheet".`;

  const vaultLine = ctx.hasVault
    ? `${ctx.vaultCount} research paper(s) / files in vault — call read_full_context for full text`
    : "No vault files";

  const uploadsLine = ctx.hasUploads
    ? "Chart context files uploaded — call read_full_context to access them"
    : "No chart context uploads";

  const methodsLine = ctx.hasMethodology
    ? "Methodology section available — included in read_full_context"
    : "No methodology section";

  const studySetupBlock = ctx.preThesisBlock
    ? `=== STUDY SETUP — READ THIS FIRST ===
${ctx.preThesisBlock}`
    : "No pre-thesis or synopsis available. Use the user's message to infer the study design.";

  const vaultMetaBlock = ctx.vaultMetaBlock
    ? `=== RESEARCH VAULT CATALOG ===
${ctx.vaultMetaBlock.slice(0, 6000)}`
    : "";

  return `You are the MANTHANA Excel Master — a world-class clinical data specialist dedicated to building production-quality master chart Excel workbooks for Indian medical university theses (MD/MS/DM/MCh/PhD).

You operate as a completely standalone, premium-grade agent. You have full access to the scholar's study design, research vault, and all uploaded context files. You never need to ask the user for study information — you already have it embedded in this system prompt and available via tools.

Your only job: build, refine, and perfect the master chart Excel workbook. Every sheet must precisely match the study protocol.

Workspace: ${ctx.workspaceTitle}
Domain: ${ctx.domain}
Chart: ${chartName} (mode: ${chartMode})
Context available: ${vaultLine} | ${uploadsLine} | ${methodsLine}

${studySetupBlock}

${vaultMetaBlock}

${workbookBlock}

═══════════════════════════════════════
TOOL USAGE PROTOCOL (always follow this order):
═══════════════════════════════════════
1. For NEW charts: call read_full_context first to read study design + vault files, then build with apply_sheet_patch (add_sheet).
2. For EDITS: call read_sheet_state first to see current columns, then apply targeted patches.
3. After building columns: call generate_sample_rows to fill realistic mock data aligned with the study.
4. For derived columns (BMI, age, ratios): use add_formula_column.
5. Always call validate_sheet before committing.
6. Call commit_version only when the schema is correct and user is satisfied.
7. NEVER emit raw JSON workbook specs in your response text — all changes go through tools only.

═══════════════════════════════════════
EXCEL BEST PRACTICES:
═══════════════════════════════════════
- Column headers: unique, concise (≤20 chars), standard clinical nomenclature (e.g. "Age_yr", "BMI_kgm2", "HbA1c_%", "SBP_mmHg").
- Types: "number" for all measurements, "date" for dates, "string" for categorical/free-text/IDs.
- Validation: always add options for categoricals (Sex: ["M","F","Other"], Group: ["Case","Control","Placebo"]).
- Sheet names: ≤31 chars, Excel-safe (no :/?*[]\\ characters).
- Multi-group or multi-timepoint studies: split into separate sheets (Patient Info | Lab Values | Outcomes | Follow-Up).
- Sample rows: 30–80 realistic rows matching the actual study population. Use plausible ranges (Age 18–65, BMI 18–35, etc.).
- PatientID column: always present, format PT001..PT080.
- After every tool action: confirm what changed in 1–2 plain sentences.`;
}

// ─── Tool definitions ────────────────────────────────────────────────────────

const READ_SHEET_STATE_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "read_sheet_state",
    description:
      "Read the current working workbook: all sheets, columns, row counts, and validation rules. Call before making any edits to understand what already exists.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

const READ_FULL_CONTEXT_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "read_full_context",
    description:
      "Read the complete workspace context: full pre-thesis setup, all research vault file contents, chart-specific uploaded files, and methodology. Use when building a new chart or when the user refers to their study design, protocol, or uploaded documents. Returns up to 150,000 characters of combined context.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

const APPLY_PATCH_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "apply_sheet_patch",
    description:
      "Apply a structured, validated patch to the working workbook. Use for: adding/removing/renaming columns, adding/removing rows, adding/removing sheets, setting column validation, reordering columns, replacing a sheet, or renaming a sheet. Always prefer small targeted patches over full regeneration.",
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
        sheetIndex: { type: "number", description: "0-based index of the target sheet (default 0)" },
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
        afterHeader: { type: "string", description: "For add_columns: insert after this header" },
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

const GENERATE_SAMPLE_ROWS_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "generate_sample_rows",
    description:
      "Generate realistic clinical sample rows for the current workbook schema, aligned with the study design. Rows must have plausible values for every column (correct ranges, realistic distributions, matching categorical options). Use this after columns are finalized.",
    parameters: {
      type: "object",
      properties: {
        sheetIndex: {
          type: "number",
          description: "0-based index of the sheet to populate (default 0)",
        },
        count: {
          type: "number",
          description: "Number of rows to generate (10–80, default 40)",
        },
        studyNotes: {
          type: "string",
          description: "Optional short note about the study population or group distribution to guide row generation",
        },
      },
      required: [],
    },
  },
};

const ADD_FORMULA_COLUMN_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "add_formula_column",
    description:
      "Add a derived or calculated column to a sheet. Use for columns like BMI (from height + weight), age from DOB, delta scores (post - pre), ratios, or any value computed from other columns. The column is added with type 'number' and a formula note in the validation field.",
    parameters: {
      type: "object",
      properties: {
        sheetIndex: { type: "number", description: "0-based sheet index (default 0)" },
        header: { type: "string", description: "Column header for the derived column (e.g. 'BMI_kgm2')" },
        formula: {
          type: "string",
          description: "Plain-language formula description (e.g. 'Weight_kg / (Height_m * Height_m)'). This is stored as a note, not an Excel formula.",
        },
        afterHeader: { type: "string", description: "Insert after this existing column header" },
        sampleValue: {
          type: "number",
          description: "A typical/example value for this derived column (used in sample rows)",
        },
      },
      required: ["header", "formula"],
    },
  },
};

const VALIDATE_SHEET_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "validate_sheet",
    description:
      "Validate the current working workbook. Checks for duplicate headers, empty sheets, conflicting sheet names, missing required columns, and structural issues. Always call before commit_version.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

const COMMIT_VERSION_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "commit_version",
    description:
      "Save the working workbook as a new versioned XLSX file. Writes to Supabase Storage, mirrors to Research Vault, and creates a new version row. Only call after validate_sheet passes and the user is satisfied with the schema.",
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
    READ_FULL_CONTEXT_TOOL,
    APPLY_PATCH_TOOL,
    GENERATE_SAMPLE_ROWS_TOOL,
    ADD_FORMULA_COLUMN_TOOL,
    VALIDATE_SHEET_TOOL,
    COMMIT_VERSION_TOOL,
  ];
}
