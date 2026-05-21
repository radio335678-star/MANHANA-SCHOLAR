import type OpenAI from "openai";
import { buildChatSystemPrompt, buildGenerateSystemPrompt } from "./academicPrompt";

const PREMIUM_THESIS_WRITER = `You are a senior expert thesis writer at the top 1% level — a genius academic author specializing in Indian medical theses (MD/MS/PhD) ready for university submission.

PREMIUM WRITING STANDARDS:
- Write with exceptional scholarly depth, logical flow, and clinical precision.
- Maintain coherence with adjacent sections — terminology, abbreviations, and narrative arc must align.
- Use highlighted emphasis sparingly for key findings using [HIGHLIGHT]...[/HIGHLIGHT] markers.
- Track abbreviations: on first use write "Full Term (ABBR)" then use ABBR consistently.
- For statistical content, report exact values, confidence intervals, and p-values where applicable.
- For Review of Literature: synthesize themes, compare studies, identify gaps.
- For Methods: reproducible protocol detail aligned with locked pre-thesis blueprint.
- For Results: objective presentation without interpretation.
- For Discussion: interpret findings, compare with literature, acknowledge limitations.
- End substantive sections with a brief transition sentence linking to the next chapter when appropriate.`;

export function buildThesisSectionSystemPrompt(opts: {
  qualification?: string | null;
  domain?: string | null;
  thesisTitle: string;
  sectionTitle: string;
  sectionType: string;
  targetPages?: number | null;
  minPages?: number | null;
  maxPages?: number | null;
  sectionContent?: string | null;
  contextBlock?: string;
  vaultResourceCount?: number;
  adjacentSummaries?: string;
  researchNotes?: string;
  attachmentContext?: string;
  humaniserBlock?: string;
}): string {
  const pageHint =
    opts.targetPages != null
      ? `Target length: approximately ${opts.targetPages} pages (~${opts.targetPages * 250} words). Acceptable range: ${opts.minPages ?? 1}–${opts.maxPages ?? opts.targetPages} pages.`
      : "";

  const base = buildChatSystemPrompt({
    qualification: opts.qualification,
    domain: opts.domain,
    thesisTitle: opts.thesisTitle,
    sectionTitle: opts.sectionTitle,
    sectionType: opts.sectionType,
    sectionContent: opts.sectionContent,
    contextBlock: opts.contextBlock,
    vaultResourceCount: opts.vaultResourceCount,
  });

  const extras = [
    PREMIUM_THESIS_WRITER,
    opts.humaniserBlock ?? "",
    pageHint,
    opts.adjacentSummaries
      ? `ADJACENT SECTION SUMMARIES (maintain coherence):\n${opts.adjacentSummaries}`
      : "",
    opts.researchNotes ? `RESEARCH PASS FINDINGS:\n${opts.researchNotes}` : "",
    opts.attachmentContext ? `USER UPLOADED FILES:\n${opts.attachmentContext}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return `${base}\n\n${extras}`;
}

export function buildThesisGenerateSystemPrompt(opts: {
  qualification?: string | null;
  domain?: string | null;
  toneDesc: string;
  wordHint: string;
  contextBlock?: string;
  vaultResourceCount?: number;
  sectionTitle?: string;
  targetPages?: number | null;
  adjacentSummaries?: string;
  researchNotes?: string;
  humaniserBlock?: string;
}): string {
  const pageHint =
    opts.targetPages != null
      ? ` Target approximately ${opts.targetPages * 250} words (${opts.targetPages} pages).`
      : opts.wordHint;

  const base = buildGenerateSystemPrompt({
    qualification: opts.qualification,
    domain: opts.domain,
    toneDesc: opts.toneDesc,
    wordHint: pageHint,
    contextBlock: opts.contextBlock,
    vaultResourceCount: opts.vaultResourceCount,
  });

  return [
    base,
    PREMIUM_THESIS_WRITER,
    opts.humaniserBlock ?? "",
    opts.sectionTitle ? `Section: ${opts.sectionTitle}` : "",
    opts.adjacentSummaries
      ? `ADJACENT SECTION SUMMARIES:\n${opts.adjacentSummaries}`
      : "",
    opts.researchNotes ? `RESEARCH PASS FINDINGS:\n${opts.researchNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildResearchPassPrompt(opts: {
  thesisTitle: string;
  sectionTitle: string;
  domain?: string | null;
  contextBlock?: string;
}): string {
  return `You are a medical research assistant. Search for current, authoritative evidence to support the "${opts.sectionTitle}" section of the thesis "${opts.thesisTitle}" in ${opts.domain ?? "medicine"}.

Use web search to find:
- Recent peer-reviewed studies (2020–2026)
- Indian medical university guidelines where relevant
- Classical Ayurveda/modern integrative references if applicable

Return a concise research brief (500–800 words) with key findings, study names, and suggested vault citation themes. Do NOT write the full section yet.

${opts.contextBlock ? `CONTEXT:\n${opts.contextBlock}` : ""}`;
}

export const APPLY_SECTION_PATCH_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "apply_section_patch",
    description: "Save generated section content to the thesis document",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "Full section body in formal academic prose" },
        summary: { type: "string", description: "One-line summary of what was written" },
      },
      required: ["content", "summary"],
    },
  },
};
