import { db } from "@workspace/db";
import { vaultResourcesTable, activityEventsTable, eq } from "@workspace/db";
import { uploadVaultFile, isStorageConfigured } from "./supabaseStorage";

export async function saveArtifactToVault(opts: {
  workspaceId: number;
  userId: number;
  title: string;
  filename: string;
  buffer: Buffer;
  mimeType: string;
  activityDescription: string;
}): Promise<number | undefined> {
  if (!isStorageConfigured()) return undefined;

  const [resource] = await db
    .insert(vaultResourcesTable)
    .values({
      workspaceId: opts.workspaceId,
      type: "paper",
      title: opts.title,
      processingStatus: "pending",
      mimeType: opts.mimeType,
    })
    .returning();

  const storagePath = await uploadVaultFile(
    opts.workspaceId,
    resource!.id,
    opts.filename,
    opts.buffer,
    opts.mimeType,
  );

  await db
    .update(vaultResourcesTable)
    .set({
      storagePath,
      processingStatus: "ready",
      updatedAt: new Date(),
    })
    .where(eq(vaultResourcesTable.id, resource!.id));

  await db.insert(activityEventsTable).values({
    userId: opts.userId,
    workspaceId: opts.workspaceId,
    type: "vault_resource_added",
    description: opts.activityDescription,
  });

  return resource!.id;
}
