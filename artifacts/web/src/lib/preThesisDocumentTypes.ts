export type LiteratureRef = {
  serialNo: number;
  title: string;
  authors: string;
  year?: number | null;
  journal?: string;
  doi?: string;
  url?: string;
  vancouverCitation: string;
  relevanceNote?: string;
  vaultResourceId?: number;
  sourceType: "literature";
};

/** Client-side mirror of PreThesisDocumentV2 (API resultJson). */
export type PreThesisDocumentV2 = {
  buildVersion: 2;
  header: {
    degreeTitle: string;
    universityOrdinances: string;
    candidateName?: string;
    guideName?: string;
    coGuideName?: string;
    departmentName?: string;
    collegeName?: string;
    state?: string;
    universityName?: string;
    workspaceTitle: string;
    domain: string;
    qualification?: string;
    generatedAt: string;
    lastLiveVerifiedAt: string;
  };
  partA: {
    paginationNote: string;
    preliminaryPages: Array<{ page: string; title: string; content: string }>;
  };
  partB: {
    paginationNote: string;
    pageLimitNote: string;
    chapters: Array<{ chapter: string; title: string; minPages?: number; maxPages?: number; notes?: string }>;
  };
  partC: {
    paginationNote: string;
    supplementary: Array<{ id: string; title: string; content?: string }>;
  };
  formattingSpecs: {
    sourceNote: string;
    rows: Array<{ element: string; specification: string }>;
  };
  chapterBlueprints: Array<{ chapter: string; title: string; bullets: string[] }>;
  keyRules: string[];
  referencesGuide: {
    intro: string;
    examples: string[];
    seedReferences?: string[];
  };
  annexureTemplates: Array<{ id: string; title: string; templateContent?: string }>;
  lockedResearchContext: string;
  rulesJson: Record<string, unknown>;
  sources: Array<{
    query?: string;
    title: string;
    url?: string;
    snippet?: string;
    attribution: "template" | "live";
    confidence?: string;
    sourceType?: string;
    fetchedAt?: string;
  }>;
  warnings?: string[];
  literatureReferences?: LiteratureRef[];
};

export function parsePreThesisDocument(
  raw: Record<string, unknown> | null | undefined,
): PreThesisDocumentV2 | null {
  if (!raw || raw.buildVersion !== 2) return null;
  return raw as unknown as PreThesisDocumentV2;
}
