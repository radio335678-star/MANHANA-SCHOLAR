/** Accepted Research Vault uploads (must match api-server vault route). */
export const VAULT_ACCEPT =
  ".pdf,.doc,.docx,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,.tif";

export const VAULT_MAX_BYTES = 25 * 1024 * 1024;

export type VaultResourceExtended = {
  id: number;
  workspaceId?: number;
  type: string;
  title: string;
  content?: string | null;
  url?: string | null;
  authors?: string | null;
  year?: number | null;
  journal?: string | null;
  doi?: string | null;
  createdAt: string;
  updatedAt?: string;
  storagePath?: string | null;
  mimeType?: string | null;
  processingStatus?: "pending" | "processing" | "ready" | "failed" | string;
};

export async function uploadVaultResource(
  workspaceId: number,
  file: File,
  getToken: () => Promise<string | null>,
  opts?: { title?: string; content?: string; type?: string },
): Promise<VaultResourceExtended> {
  const form = new FormData();
  form.append("file", file);
  if (opts?.title) form.append("title", opts.title);
  if (opts?.content) form.append("content", opts.content);
  if (opts?.type) form.append("type", opts.type);

  const token = await getToken();
  const res = await fetch(`/api/workspaces/${workspaceId}/vault/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Upload failed (${res.status})`);
  }

  return (await res.json()) as VaultResourceExtended;
}

export async function getVaultDownloadUrl(
  workspaceId: number,
  resourceId: number,
  getToken: () => Promise<string | null>,
): Promise<string> {
  const token = await getToken();
  const res = await fetch(
    `/api/workspaces/${workspaceId}/vault/${resourceId}/download`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!res.ok) {
    throw new Error("Could not get download link");
  }
  const json = (await res.json()) as { downloadUrl: string };
  return json.downloadUrl;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}
