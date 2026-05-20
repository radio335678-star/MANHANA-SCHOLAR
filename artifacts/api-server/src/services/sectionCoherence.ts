import { db } from "@workspace/db";
import { sectionsTable, eq, asc } from "@workspace/db";
import type { VaultCitationCatalog } from "@workspace/vault-citations";

export type CoherenceIssue = {
  type: "abbreviation" | "citation" | "contradiction" | "info";
  message: string;
  sectionTitle?: string;
};

export type CoherenceReport = {
  score: number;
  issues: CoherenceIssue[];
  abbreviationMap: Record<string, string>;
  citedKeys: string[];
  unknownKeys: string[];
};

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeContent(content: string | null | undefined, maxWords = 500): string {
  if (!content?.trim()) return "";
  const text = stripHtml(content);
  const words = text.split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}

export async function getAdjacentSectionSummaries(
  workspaceId: number,
  sectionId: number,
): Promise<string> {
  const sections = await db
    .select()
    .from(sectionsTable)
    .where(eq(sectionsTable.workspaceId, workspaceId))
    .orderBy(asc(sectionsTable.order));

  const idx = sections.findIndex((s) => s.id === sectionId);
  if (idx === -1) return "";

  const parts: string[] = [];
  if (idx > 0) {
    const prev = sections[idx - 1]!;
    const summary = summarizeContent(prev.content);
    if (summary) parts.push(`Previous section "${prev.title}":\n${summary}`);
  }
  if (idx < sections.length - 1) {
    const next = sections[idx + 1]!;
    const summary = summarizeContent(next.content);
    if (summary) parts.push(`Next section "${next.title}" (planned):\n${summary || "[not yet written]"}`);
  }
  return parts.join("\n\n");
}

function extractAbbreviations(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  const re = /([A-Z][A-Za-z\- ]{2,40})\s*\(([A-Z]{2,10})\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    map[m[2]!] = m[1]!.trim();
  }
  return map;
}

function extractCitationKeys(text: string): string[] {
  const keys = new Set<string>();
  const re = /\[V(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    keys.add(`V${m[1]}`);
  }
  return [...keys];
}

export function analyzeCoherence(
  sections: Array<{ title: string; content?: string | null }>,
  vaultCatalog: VaultCitationCatalog,
): CoherenceReport {
  const issues: CoherenceIssue[] = [];
  const globalAbbr: Record<string, string> = {};
  const citedKeys = new Set<string>();
  const unknownKeys = new Set<string>();

  for (const section of sections) {
    const text = stripHtml(section.content ?? "");
    if (!text) continue;

    const abbr = extractAbbreviations(text);
    for (const [key, expansion] of Object.entries(abbr)) {
      if (globalAbbr[key] && globalAbbr[key] !== expansion) {
        issues.push({
          type: "abbreviation",
          message: `Abbreviation "${key}" defined as "${expansion}" in "${section.title}" but previously as "${globalAbbr[key]}"`,
          sectionTitle: section.title,
        });
      } else {
        globalAbbr[key] = expansion;
      }
    }

    for (const key of extractCitationKeys(text)) {
      citedKeys.add(key);
      if (!vaultCatalog[key]) {
        unknownKeys.add(key);
        issues.push({
          type: "citation",
          message: `Citation [${key}] in "${section.title}" not found in Research Vault`,
          sectionTitle: section.title,
        });
      }
    }
  }

  const writtenCount = sections.filter((s) => stripHtml(s.content ?? "").length > 100).length;
  const score = Math.max(
    0,
    Math.min(100, 100 - issues.length * 8 + (writtenCount > 0 ? 10 : 0)),
  );

  return {
    score,
    issues,
    abbreviationMap: globalAbbr,
    citedKeys: [...citedKeys],
    unknownKeys: [...unknownKeys],
  };
}

export async function runCoherenceCheck(workspaceId: number, vaultCatalog: VaultCitationCatalog) {
  const sections = await db
    .select({ title: sectionsTable.title, content: sectionsTable.content })
    .from(sectionsTable)
    .where(eq(sectionsTable.workspaceId, workspaceId))
    .orderBy(asc(sectionsTable.order));

  return analyzeCoherence(sections, vaultCatalog);
}
