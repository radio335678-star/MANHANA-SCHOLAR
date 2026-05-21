import type { PreThesisDocumentV2 } from "../types/preThesisDocumentV2";

/** Keywords that signal the user wants a structural change — requires the full document JSON. */
const STRUCTURAL_KEYWORDS = [
  "add",
  "remove",
  "delete",
  "insert",
  "change",
  "update",
  "format",
  "chapter",
  "section",
  "bibliography",
  "reference",
  "annexure",
  "appendix",
  "page",
  "font",
  "spacing",
  "source",
  "preliminary",
  "generate",
  "rebuild",
  "restructure",
  "replace",
  "rename",
  "move",
  "reorder",
];

function needsFullDocument(userMessage: string, historyLength: number): boolean {
  if (historyLength === 0) return true;
  const lower = userMessage.toLowerCase();
  return STRUCTURAL_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Condensed structural summary for follow-up turns that don't need full JSON. */
function buildDocumentSummary(doc: PreThesisDocumentV2): string {
  const chapters = doc.partB.chapters.map((c) => c.title).join(", ");
  const prelim = doc.partA.preliminaryPages.map((p) => p.title).join(", ");
  const annexures = doc.partC.supplementary.map((a) => a.title).join(", ");
  const liveSources = doc.sources.filter((s) => s.attribution === "live").length;
  const templateSources = doc.sources.filter((s) => s.attribution === "template").length;
  const formatSample = doc.formattingSpecs.rows
    .slice(0, 4)
    .map((r) => `${r.element}: ${r.specification}`)
    .join("; ");
  const blueprintTitles = doc.chapterBlueprints.map((b) => b.title).join(", ");

  return `Document structure summary (buildVersion: 2):
- Preliminary pages (Part A): ${prelim || "none"}
- Chapters (Part B): ${chapters || "none"}
- Supplementary / Annexures (Part C): ${annexures || "none"}
- Chapter blueprints: ${blueprintTitles || "none"}
- Sources: ${liveSources} live, ${templateSources} template
- Formatting sample: ${formatSample}
- Generated: ${doc.header.generatedAt}

Note: Full document JSON is not included for this follow-up turn to save tokens.
To patch the document use apply_pre_thesis_patch with the correct schema fields.`;
}

export function buildPreThesisAgentSystemPrompt(
  ctx: {
    workspaceTitle: string;
    domain: string;
    qualification?: string | null;
    candidateName?: string | null;
    studyType?: string | null;
    hasSynopsis: boolean;
    checklist: Record<string, boolean>;
    unresolvedConflicts: Array<{
      fieldKey: string;
      templateValue: string | null;
      liveValue: string | null;
    }>;
    document: PreThesisDocumentV2;
    researchNotes?: string | null;
  },
  opts?: { userMessage?: string; historyLength?: number },
): string {
  const checklistLines = Object.entries(ctx.checklist)
    .map(([k, v]) => `- ${k}: ${v ? "done" : "pending"}`)
    .join("\n");

  const conflictLines =
    ctx.unresolvedConflicts.length > 0
      ? ctx.unresolvedConflicts
          .map(
            (c) =>
              `- ${c.fieldKey}: template="${c.templateValue ?? ""}" vs live="${c.liveValue ?? ""}"`,
          )
          .join("\n")
      : "None";

  const historyLength = opts?.historyLength ?? 0;
  const userMessage = opts?.userMessage ?? "";
  const useFullDoc = needsFullDocument(userMessage, historyLength);

  const documentBlock = useFullDoc
    ? `Current document JSON (authoritative — patch this):\n${JSON.stringify(ctx.document)}`
    : buildDocumentSummary(ctx.document);

  return `You are the MANTHANA Pre-Thesis Setup Assistant — an expert academic document architect for Indian medical university theses (MD/MS/DM/MCh).

The scholar NEVER edits the structure manually. You MUST apply every structural or content change using the tool \`apply_pre_thesis_patch\` with a partial JSON object matching the PreThesisDocumentV2 schema (buildVersion: 2).

You may use web search when university guidelines, ordinances, or formatting rules need verification.

Current workspace:
- Title: ${ctx.workspaceTitle}
- Domain: ${ctx.domain}
- Qualification: ${ctx.qualification ?? "—"}
- Candidate: ${ctx.candidateName ?? "—"}
- Study type: ${ctx.studyType ?? "—"}
- Synopsis on file: ${ctx.hasSynopsis ? "yes" : "no"}

Checklist:
${checklistLines}

Unresolved conflicts:
${conflictLines}

Research notes (context only, do not duplicate in document unless asked):
${ctx.researchNotes?.trim() || "—"}

${documentBlock}

Rules:
1. Explain briefly what you will change, then call apply_pre_thesis_patch.
2. Patch only the fields you need (deep merge supported).
3. Keep buildVersion: 2. Preserve header.generatedAt unless regenerating entire doc.
4. For formatting/chapter/source requests, update formattingSpecs, chapterBlueprints, partA/B/C, and sources as needed.
5. After patching, confirm what changed in plain language.
6. Do not tell the user to edit Raw MD — they use the visual preview only.
7. Be precise about university thesis structure (Vancouver references, preliminary pages, chapter limits).`;
}

export const APPLY_PATCH_TOOL = {
  type: "function" as const,
  function: {
    name: "apply_pre_thesis_patch",
    description:
      "Apply a partial update to the pre-thesis structure document (PreThesisDocumentV2). Deep-merges into current document, recompiles preview and draft MD.",
    parameters: {
      type: "object",
      properties: {
        patch: {
          type: "object",
          description: "Partial PreThesisDocumentV2 fields to merge",
        },
        summary: {
          type: "string",
          description: "Short human-readable summary of changes for revision history",
        },
      },
      required: ["patch", "summary"],
    },
  },
};
