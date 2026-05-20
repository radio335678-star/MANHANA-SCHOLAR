/** Shared vault citation keys and formatting for API + web. */

export type VaultResourceForCitation = {
  id: number;
  type: string;
  title: string;
  content?: string | null;
  authors?: string | null;
  year?: number | null;
  journal?: string | null;
  doi?: string | null;
  url?: string | null;
};

export type VaultCitationEntry = {
  key: string;
  resourceId: number;
  title: string;
  type: string;
  authors: string | null;
  year: number | null;
  journal: string | null;
  doi: string | null;
  authorYear: string;
  bibliographyLine: string;
};

export type VaultCitationCatalog = Record<string, VaultCitationEntry>;

const TYPE_PRIORITY: Record<string, number> = {
  paper: 0,
  reference: 1,
  note: 2,
  link: 3,
  image: 4,
};

const MAX_EXCERPT_CHARS = 600;
const MAX_VAULT_BLOCK_CHARS = 9000;

export function sortResourcesForCitations<T extends VaultResourceForCitation>(
  resources: T[],
): T[] {
  return [...resources].sort((a, b) => {
    const pa = TYPE_PRIORITY[a.type] ?? 5;
    const pb = TYPE_PRIORITY[b.type] ?? 5;
    if (pa !== pb) return pa - pb;
    return (b.year ?? 0) - (a.year ?? 0);
  });
}

/** Author–year string for in-text citation, e.g. Sharma et al., 2023 */
export function formatAuthorYear(
  authors: string | null | undefined,
  year: number | null | undefined,
): string {
  if (!authors?.trim()) {
    return year ? `(${year})` : "(n.d.)";
  }
  const a = authors.trim();
  const parts = a.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  const surname =
    parts[0]?.split(/\s+/).filter(Boolean).pop() ??
    parts[0] ??
    "Author";
  const label =
    parts.length > 1 || /\bet\s*al\.?/i.test(a) ? `${surname} et al.` : surname;
  return year ? `${label}, ${year}` : `${label}, n.d.`;
}

export function formatBibliographyEntry(
  r: VaultResourceForCitation,
  index: number,
): string {
  const bits: string[] = [];
  if (r.authors?.trim()) bits.push(r.authors.trim());
  if (r.year) bits.push(`(${r.year}).`);
  bits.push(r.title);
  if (r.journal?.trim()) bits.push(`${r.journal.trim()}.`);
  if (r.doi?.trim()) {
    const doi = r.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
    bits.push(`https://doi.org/${doi}`);
  } else if (r.url?.trim()) {
    bits.push(r.url.trim());
  }
  return `${index}. ${bits.join(" ")}`;
}

export function buildCitationCatalog(
  resources: VaultResourceForCitation[],
): VaultCitationCatalog {
  const sorted = sortResourcesForCitations(resources);
  const catalog: VaultCitationCatalog = {};
  sorted.forEach((r, i) => {
    const key = `V${i + 1}`;
    catalog[key] = {
      key,
      resourceId: r.id,
      title: r.title,
      type: r.type,
      authors: r.authors ?? null,
      year: r.year ?? null,
      journal: r.journal ?? null,
      doi: r.doi ?? null,
      authorYear: formatAuthorYear(r.authors, r.year),
      bibliographyLine: formatBibliographyEntry(r, i + 1),
    };
  });
  return catalog;
}

function excerpt(text: string | null | undefined, max = MAX_EXCERPT_CHARS): string {
  if (!text?.trim()) return "";
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function buildVaultContextBlock(
  resources: VaultResourceForCitation[],
): { block: string; catalog: VaultCitationCatalog; resourceCount: number } {
  const sorted = sortResourcesForCitations(resources);
  const catalog = buildCitationCatalog(sorted);

  if (sorted.length === 0) {
    return {
      block: `RESEARCH VAULT: No sources saved yet. Do not invent references or use placeholder citations. If evidence is required, state that the scholar should add papers to the Research Vault first.`,
      catalog: {},
      resourceCount: 0,
    };
  }

  const lines: string[] = [
    "RESEARCH VAULT — APPROVED SOURCES (cite ONLY these; use inline keys exactly as [V1], [V2], etc.):",
    "",
  ];

  let totalChars = 0;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]!;
    const key = `V${i + 1}`;
    const entry = catalog[key]!;
    const chunk = [
      `[${key}] ${entry.authorYear}`,
      `Title: ${r.title}`,
      r.journal ? `Journal: ${r.journal}` : null,
      r.doi ? `DOI: ${r.doi}` : null,
      r.url ? `URL: ${r.url}` : null,
      excerpt(r.content) ? `Notes/excerpt: ${excerpt(r.content)}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    if (totalChars + chunk.length > MAX_VAULT_BLOCK_CHARS) {
      lines.push(`[… ${sorted.length - i} additional vault sources omitted for length — prefer cited keys above …]`);
      break;
    }
    lines.push(chunk, "");
    totalChars += chunk.length;
  }

  lines.push(
    "CITATION RULES:",
    "- Every factual or literature claim must end with the matching vault key, e.g. …as reported previously [V2].",
    "- Do NOT use [Author, Year] placeholders, fabricated references, or sources not listed above.",
    "- Do NOT cite a key unless its excerpt supports the claim.",
    "- After the main prose, add a short block titled 'References (Research Vault)' listing each [Vn] used as: [Vn] full bibliography line.",
  );

  return {
    block: lines.join("\n"),
    catalog,
    resourceCount: sorted.length,
  };
}

const VAULT_KEY_RE = /\[V(\d+)\]/gi;

export function extractCitedVaultKeys(text: string): string[] {
  const keys = new Set<string>();
  for (const m of text.matchAll(VAULT_KEY_RE)) {
    keys.add(`V${m[1]}`);
  }
  return [...keys].sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
}

/** Replace [V1] with author–year for thesis-ready prose. */
export function expandVaultCitationsInText(
  text: string,
  catalog: VaultCitationCatalog,
): string {
  return text.replace(VAULT_KEY_RE, (_, n) => {
    const key = `V${n}`;
    const entry = catalog[key];
    if (!entry) return "[source unverified]";
    return entry.authorYear;
  });
}

export function buildReferencesAppendix(
  catalog: VaultCitationCatalog,
  usedKeys: string[],
): string {
  const lines = usedKeys
    .map((k) => {
      const e = catalog[k];
      if (!e) return null;
      return `[${k}] ${e.bibliographyLine.replace(/^\d+\.\s*/, "")}`;
    })
    .filter(Boolean) as string[];
  if (lines.length === 0) return "";
  return `\n\nReferences (Research Vault)\n${lines.join("\n")}`;
}

/** Keys cited in text but missing from catalog (possible hallucination). */
export function findUnknownVaultKeys(
  text: string,
  catalog: VaultCitationCatalog,
): string[] {
  return extractCitedVaultKeys(text).filter((k) => !catalog[k]);
}

export function catalogToArray(catalog: VaultCitationCatalog): VaultCitationEntry[] {
  return Object.values(catalog).sort(
    (a, b) => parseInt(a.key.slice(1), 10) - parseInt(b.key.slice(1), 10),
  );
}
