import { db } from "@workspace/db";
import { vaultResourcesTable, activityEventsTable } from "@workspace/db";
import { kimiWebSearch, kimiJsonCompletion, isMoonshotWebSearchEnabled } from "../lib/kimiTools";
import { isStorageConfigured } from "../lib/supabaseStorage";
import { logger } from "../lib/logger";
import type { LiteratureRef } from "../types/preThesisDocumentV2";
import crypto from "crypto";

export type LiteratureCollectorInput = {
  workspaceId: number;
  userId: number;
  title: string;
  domain: string;
  qualification?: string | null;
  departmentName?: string | null;
  synopsisText?: string | null;
  researchNotes?: string | null;
};

function buildLiteratureQueries(input: LiteratureCollectorInput): string[] {
  const topic = input.title.slice(0, 120);
  const dept = input.departmentName ?? input.domain;
  return [
    `${topic} systematic review PubMed`,
    `${topic} clinical study evidence India ${dept}`,
    `${topic} guidelines recommendations NMC ICMR`,
    `${topic} prevalence outcomes Indian population`,
    `${topic} recent advances 2020 2021 2022 2023 2024`,
  ];
}

function synopsisHash(synopsis?: string | null): string {
  return crypto.createHash("sha1").update(synopsis ?? "").digest("hex").slice(0, 12);
}

type RawRef = {
  title?: string;
  authors?: string;
  year?: number;
  journal?: string;
  doi?: string;
  url?: string;
  vancouverCitation?: string;
  relevanceNote?: string;
};

function dedupeRefs(refs: LiteratureRef[]): LiteratureRef[] {
  const seen = new Set<string>();
  const out: LiteratureRef[] = [];
  for (const ref of refs) {
    const key = ref.doi?.toLowerCase() || ref.title.toLowerCase().slice(0, 80);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(ref);
    }
  }
  return out;
}

export async function collectLiteratureReferences(
  input: LiteratureCollectorInput,
  onProgress?: (msg: string) => void,
): Promise<LiteratureRef[]> {
  const { workspaceId, userId, title, domain, synopsisText, researchNotes } = input;

  if (!synopsisText?.trim() && !title?.trim()) {
    onProgress?.("No synopsis — skipping literature collection");
    return [];
  }

  onProgress?.("Planning literature search queries…");
  const queries = buildLiteratureQueries(input);
  const cacheKey = `literature:${workspaceId}:${synopsisHash(synopsisText)}`;

  onProgress?.(`Searching literature: ${queries.length} queries…`);
  let searchResults: Awaited<ReturnType<typeof kimiWebSearch>> = [];
  try {
    searchResults = await kimiWebSearch(queries, cacheKey);
  } catch (err) {
    logger.warn({ err }, "Literature web search failed — continuing without live results");
    onProgress?.("Literature web search unavailable — using AI knowledge base only");
  }

  onProgress?.(`Structuring ${searchResults.length} search results into citations…`);

  const synopsisContext = [synopsisText, researchNotes].filter(Boolean).join("\n\n").slice(0, 8000);
  const searchSnippets = searchResults
    .map((r) => `Source: ${r.title}\nURL: ${r.url ?? ""}\nSnippet: ${r.snippet}`)
    .join("\n---\n")
    .slice(0, 12000);

  const systemPrompt = `You are a medical research literature expert specializing in Indian PG thesis preparation. Given a thesis topic and search snippets, return 8–15 high-quality, relevant academic references in Vancouver citation format. Return ONLY valid JSON.`;

  const userPrompt = `Thesis topic: ${title}
Domain: ${domain}
${input.departmentName ? `Department: ${input.departmentName}` : ""}

Synopsis excerpt:
${synopsisContext || "(no synopsis provided)"}

Search results:
${searchSnippets || "(no search results available)"}

Return JSON object:
{
  "references": [
    {
      "title": "Full article title",
      "authors": "Last FM, Last FM, Last FM",
      "year": 2022,
      "journal": "Journal Name",
      "doi": "10.xxxx/xxx or null",
      "url": "https://... or null",
      "vancouverCitation": "Authors. Title. Journal. Year;Vol(Issue):pages.",
      "relevanceNote": "Brief note on why this reference is relevant to the thesis topic"
    }
  ]
}

Guidelines:
- Prioritise peer-reviewed PubMed-indexed journals, Cochrane, and NMC/ICMR guidelines
- Include Indian population studies where relevant
- Include recent systematic reviews and meta-analyses (2015–2024)
- Ensure Vancouver format is complete and accurate
- Minimum 8, maximum 15 references`;

  const { data } = await kimiJsonCompletion<{ references: RawRef[] }>(systemPrompt, userPrompt, 4096);

  const rawRefs: RawRef[] = data?.references ?? [];
  onProgress?.(`AI structured ${rawRefs.length} literature references`);

  const refs: LiteratureRef[] = rawRefs
    .filter((r) => r.title && r.vancouverCitation)
    .map((r, i): LiteratureRef => ({
      serialNo: i + 1,
      title: r.title ?? "",
      authors: r.authors ?? "",
      year: r.year ?? null,
      journal: r.journal,
      doi: r.doi ?? undefined,
      url: r.url ?? undefined,
      vancouverCitation: r.vancouverCitation ?? `${r.authors ?? ""}. ${r.title ?? ""}. ${r.journal ?? ""}. ${r.year ?? ""}.`,
      relevanceNote: r.relevanceNote,
      sourceType: "literature",
    }));

  const deduped = dedupeRefs(refs).slice(0, 15).map((r, i) => ({ ...r, serialNo: i + 1 }));
  onProgress?.(`Deduped to ${deduped.length} unique references`);

  // Persist to vault as a text resource (no binary file needed for references)
  if (isStorageConfigured() && deduped.length > 0) {
    try {
      const citationText = deduped
        .map((r) => `${r.serialNo}. ${r.vancouverCitation}`)
        .join("\n");

      const [resource] = await db
        .insert(vaultResourcesTable)
        .values({
          workspaceId,
          type: "reference",
          title: `Literature References — ${title.slice(0, 80)}`,
          processingStatus: "ready",
          mimeType: "text/plain",
        })
        .returning();

      await db.insert(activityEventsTable).values({
        userId,
        workspaceId,
        type: "vault_resource_added",
        description: `${deduped.length} literature references collected for thesis topic: "${title.slice(0, 60)}"`,
      });

      onProgress?.(`Saved ${deduped.length} references to Research Vault (id: ${resource!.id})`);
    } catch (err) {
      logger.warn({ err, workspaceId }, "Failed to save literature refs to vault");
    }
  }

  return deduped;
}
