import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  buildCitationCatalog,
  catalogToArray,
  type VaultCitationCatalog,
  type VaultCitationEntry,
} from "@workspace/vault-citations";
import { useListVaultResources, getListVaultResourcesQueryKey } from "@workspace/api-client-react";

export function useVaultCitationCatalog(workspaceId: number) {
  const { getToken } = useAuth();

  const listQuery = useListVaultResources(workspaceId, {
    query: { enabled: !!workspaceId, queryKey: getListVaultResourcesQueryKey(workspaceId) },
  });

  const catalogQuery = useQuery({
    queryKey: ["vault-citation-catalog", workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<{ catalog: VaultCitationCatalog; entries: VaultCitationEntry[]; resourceCount: number }> => {
      const token = await getToken();
      const res = await fetch(`/api/workspaces/${workspaceId}/vault/citation-catalog`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = (await res.json()) as {
          resourceCount: number;
          catalog: VaultCitationEntry[];
        };
        const catalog: VaultCitationCatalog = {};
        for (const e of data.catalog) {
          catalog[e.key] = e;
        }
        return {
          catalog,
          entries: data.catalog,
          resourceCount: data.resourceCount,
        };
      }

      const resources = listQuery.data ?? [];
      const catalog = buildCitationCatalog(
        resources.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          content: r.content,
          authors: r.authors,
          year: r.year,
          journal: r.journal,
          doi: r.doi,
          url: r.url,
        }))
      );
      return {
        catalog,
        entries: catalogToArray(catalog),
        resourceCount: resources.length,
      };
    },
  });

  return {
    catalog: catalogQuery.data?.catalog ?? {},
    entries: catalogQuery.data?.entries ?? [],
    resourceCount: catalogQuery.data?.resourceCount ?? listQuery.data?.length ?? 0,
    isLoading: listQuery.isLoading || catalogQuery.isLoading,
    refetch: () => {
      listQuery.refetch();
      catalogQuery.refetch();
    },
  };
}
