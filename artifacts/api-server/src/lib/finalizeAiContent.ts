import {
  buildReferencesAppendix,
  expandVaultCitationsInText,
  extractCitedVaultKeys,
  findUnknownVaultKeys,
  type VaultCitationCatalog,
} from "@workspace/vault-citations";

export type FinalizedAiContent = {
  /** Text with [Vn] keys for storage / chat display */
  raw: string;
  /** Author–year expanded prose for document insertion */
  expanded: string;
  citedKeys: string[];
  unknownKeys: string[];
  referencesAppendix: string;
};

export function finalizeAiContent(
  raw: string,
  catalog: VaultCitationCatalog,
  options?: { expandInline?: boolean; appendReferences?: boolean },
): FinalizedAiContent {
  const citedKeys = extractCitedVaultKeys(raw);
  const unknownKeys = findUnknownVaultKeys(raw, catalog);
  const referencesAppendix = buildReferencesAppendix(catalog, citedKeys);
  let text = raw;

  if (options?.appendReferences !== false && referencesAppendix && !text.includes("References (Research Vault)")) {
    text = `${text.trim()}${referencesAppendix}`;
  }

  const expanded = options?.expandInline
    ? expandVaultCitationsInText(text, catalog)
    : text;

  return {
    raw: text,
    expanded,
    citedKeys,
    unknownKeys,
    referencesAppendix,
  };
}
