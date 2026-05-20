import { db, vaultResourcesTable, eq, and, ne } from "@workspace/db";
import {
  buildVaultContextBlock,
  type VaultCitationCatalog,
  type VaultResourceForCitation,
} from "@workspace/vault-citations";

export type VaultAiContext = {
  vaultBlock: string;
  catalog: VaultCitationCatalog;
  resourceCount: number;
};

export async function loadVaultAiContext(workspaceId: number): Promise<VaultAiContext> {
  const rows = await db
    .select({
      id: vaultResourcesTable.id,
      type: vaultResourcesTable.type,
      title: vaultResourcesTable.title,
      content: vaultResourcesTable.content,
      authors: vaultResourcesTable.authors,
      year: vaultResourcesTable.year,
      journal: vaultResourcesTable.journal,
      doi: vaultResourcesTable.doi,
      url: vaultResourcesTable.url,
    })
    .from(vaultResourcesTable)
    .where(
      and(
        eq(vaultResourcesTable.workspaceId, workspaceId),
        ne(vaultResourcesTable.processingStatus, "failed"),
      ),
    )
    .limit(35);

  const resources: VaultResourceForCitation[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    content: r.content,
    authors: r.authors,
    year: r.year,
    journal: r.journal,
    doi: r.doi,
    url: r.url,
  }));

  const { block, catalog, resourceCount } = buildVaultContextBlock(resources);
  return { vaultBlock: block, catalog, resourceCount };
}
