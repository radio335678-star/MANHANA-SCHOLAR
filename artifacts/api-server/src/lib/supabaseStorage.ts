import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";

export type StorageBucketKind = "artifacts" | "vault" | "exports";

const BUCKETS: Record<StorageBucketKind, string> = {
  artifacts: process.env.SUPABASE_STORAGE_BUCKET ?? "thesis-artifacts",
  vault: "vault-uploads",
  exports: "thesis-exports",
};

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logger.warn("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — file storage disabled");
    return null;
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export function bucketFor(kind: StorageBucketKind): string {
  return BUCKETS[kind];
}

export function isStorageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function assertStorageConfigured(): void {
  if (!isStorageConfigured()) {
    const msg = "Storage not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)";
    if (process.env.NODE_ENV === "production") {
      throw new Error(msg);
    }
    logger.warn(msg);
  }
}

export async function uploadBuffer(
  storagePath: string,
  data: Buffer | Uint8Array,
  contentType: string,
  kind: StorageBucketKind = "artifacts",
): Promise<string | null> {
  const client = getClient();
  if (!client) {
    assertStorageConfigured();
    return null;
  }

  const bucket = bucketFor(kind);
  const { error } = await client.storage.from(bucket).upload(storagePath, data, {
    contentType,
    upsert: true,
  });
  if (error) {
    logger.error({ err: error, storagePath, bucket }, "Supabase upload failed");
    throw new Error(`Storage upload failed: ${error.message}`);
  }
  return storagePath;
}

export async function uploadText(
  storagePath: string,
  text: string,
  kind: StorageBucketKind = "artifacts",
): Promise<string | null> {
  return uploadBuffer(storagePath, Buffer.from(text, "utf-8"), "text/markdown; charset=utf-8", kind);
}

export async function downloadText(
  storagePath: string,
  kind: StorageBucketKind = "artifacts",
): Promise<string | null> {
  const buf = await downloadBuffer(storagePath, kind);
  if (!buf) return null;
  return buf.toString("utf-8");
}

export async function downloadBuffer(
  storagePath: string,
  kind: StorageBucketKind = "artifacts",
): Promise<Buffer | null> {
  const client = getClient();
  if (!client) return null;
  const { data, error } = await client.storage.from(bucketFor(kind)).download(storagePath);
  if (error || !data) return null;
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

export async function createSignedDownloadUrl(
  storagePath: string,
  expiresInSeconds = 3600,
  kind: StorageBucketKind = "artifacts",
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  const { data, error } = await client.storage
    .from(bucketFor(kind))
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export function preThesisDraftPath(workspaceId: number): string {
  return `workspaces/${workspaceId}/pre-thesis/draft.md`;
}

export function preThesisLockedPath(workspaceId: number): string {
  return `workspaces/${workspaceId}/pre-thesis/locked.md`;
}

export function preThesisAuditPath(workspaceId: number, lockEventId: number): string {
  return `workspaces/${workspaceId}/pre-thesis/audit/${lockEventId}/sources.json`;
}

export function masterChartPath(workspaceId: number, chartId: number, version: number): string {
  return `workspaces/${workspaceId}/master-charts/${chartId}/v${version}.xlsx`;
}

export function vaultFilePath(workspaceId: number, resourceId: number, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `workspaces/${workspaceId}/vault/${resourceId}/${safe}`;
}

export function thesisExportPath(workspaceId: number, exportId: string): string {
  return `workspaces/${workspaceId}/exports/${exportId}.docx`;
}

export async function uploadVaultFile(
  workspaceId: number,
  resourceId: number,
  filename: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  assertStorageConfigured();
  const path = vaultFilePath(workspaceId, resourceId, filename);
  await uploadBuffer(path, buffer, mimeType, "vault");
  return path;
}

export async function uploadThesisExport(
  workspaceId: number,
  exportId: string,
  buffer: Buffer,
): Promise<string> {
  assertStorageConfigured();
  const path = thesisExportPath(workspaceId, exportId);
  await uploadBuffer(
    path,
    buffer,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.sheet",
    "exports",
  );
  return path;
}

async function removeStorageFolder(
  client: SupabaseClient,
  bucket: string,
  folderPath: string,
): Promise<void> {
  const { data: entries, error } = await client.storage.from(bucket).list(folderPath, {
    limit: 1000,
  });
  if (error) {
    logger.warn({ err: error, bucket, folderPath }, "Storage list failed during workspace cleanup");
    return;
  }
  if (!entries?.length) return;

  const filePaths: string[] = [];
  for (const entry of entries) {
    const path = folderPath ? `${folderPath}/${entry.name}` : entry.name;
    if (entry.id) {
      filePaths.push(path);
    } else {
      await removeStorageFolder(client, bucket, path);
    }
  }

  if (filePaths.length > 0) {
    const { error: removeError } = await client.storage.from(bucket).remove(filePaths);
    if (removeError) {
      logger.warn({ err: removeError, bucket, filePaths }, "Storage remove failed during workspace cleanup");
    }
  }
}

/** Best-effort removal of all objects under workspaces/{workspaceId}/ across buckets. */
export async function deleteWorkspaceStorage(workspaceId: number): Promise<void> {
  const client = getClient();
  if (!client) return;

  const prefix = `workspaces/${workspaceId}`;
  const kinds: StorageBucketKind[] = ["artifacts", "vault", "exports"];

  for (const kind of kinds) {
    await removeStorageFolder(client, bucketFor(kind), prefix);
  }
}
