import { kimiJsonCompletion } from "../lib/kimiTools";
import type { WebSearchResult } from "../lib/kimiTools";

export type ExtractedGuidelines = Record<string, unknown>;

const EXTRACT_SYSTEM = `You extract Indian medical university thesis formatting rules from search results.
Return ONLY valid JSON with these keys (use null if unknown):
{
  "paper": string,
  "font": string,
  "chapterFont": string,
  "spacing": string,
  "abstractSpacing": string,
  "margins": string,
  "pageLimitMin": number,
  "pageLimitMax": number,
  "binding": string,
  "referencing": string,
  "language": string,
  "plagiarismMaxPercent": number,
  "preliminaryPagination": string,
  "bodyPagination": string,
  "tables": string,
  "figures": string,
  "printing": string
}`;

export async function extractGuidelinesFromSearch(
  templateRules: Record<string, unknown>,
  searchResults: WebSearchResult[],
  universityName: string,
): Promise<ExtractedGuidelines> {
  const snippets = searchResults
    .map((r) => `Query: ${r.query ?? r.title}\n${r.snippet}`)
    .join("\n\n");

  const { data: merged } = await kimiJsonCompletion<ExtractedGuidelines>(
    EXTRACT_SYSTEM,
    `University: ${universityName}
Existing template rules: ${JSON.stringify(templateRules)}
Live search results:
${snippets}

Merge template with live findings. Prefer live values when they conflict and confidence is high.`,
    2048,
  );

  if (!merged) return { ...templateRules };
  return { ...templateRules, ...merged };
}

export function detectConflicts(
  templateRules: Record<string, unknown>,
  liveRules: Record<string, unknown>,
): Array<{
  fieldKey: string;
  templateValue: string;
  liveValue: string;
  severity: "info" | "warning" | "critical";
}> {
  const conflicts: Array<{
    fieldKey: string;
    templateValue: string;
    liveValue: string;
    severity: "info" | "warning" | "critical";
  }> = [];

  const criticalFields = ["pageLimitMax", "pageLimitMin", "referencing", "plagiarismMaxPercent"];
  const compareFields = [
    "pageLimitMax",
    "pageLimitMin",
    "font",
    "spacing",
    "margins",
    "referencing",
    "plagiarismMaxPercent",
  ];

  for (const key of compareFields) {
    const t = templateRules[key];
    const l = liveRules[key];
    if (t == null || l == null || String(t) === String(l)) continue;
    conflicts.push({
      fieldKey: key,
      templateValue: String(t),
      liveValue: String(l),
      severity: criticalFields.includes(key) ? "critical" : "warning",
    });
  }

  return conflicts;
}
