import type { PreThesisDocumentV2 } from "../types/preThesisDocumentV2";

export function buildPreThesisAgentSystemPrompt(ctx: {
  workspaceTitle: string;
  domain: string;
  qualification?: string | null;
  candidateName?: string | null;
  studyType?: string | null;
  hasSynopsis: boolean;
  checklist: Record<string, boolean>;
  unresolvedConflicts: Array<{ fieldKey: string; templateValue: string | null; liveValue: string | null }>;
  document: PreThesisDocumentV2;
  researchNotes?: string | null;
}): string {
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

Current document JSON (authoritative — patch this):
${JSON.stringify(ctx.document)}

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
