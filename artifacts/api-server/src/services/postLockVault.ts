import { db } from "@workspace/db";
import {
  workspacesTable,
  vaultResourcesTable,
  postLockJobsTable,
  activityEventsTable,
  eq,
  and,
  or,
  sql,
} from "@workspace/db";
import { buildPreThesisDocxBuffer } from "./preThesisDocxBuffer";
import {
  isStorageConfigured,
  uploadVaultFile,
  assertStorageConfigured,
} from "../lib/supabaseStorage";
import { logger } from "../lib/logger";

const RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000, 600_000];

export async function enqueuePostLockVaultUpload(
  workspaceId: number,
  userId: number,
  lockEventId?: number,
): Promise<{ jobId: number; vaultResourceId?: number; uploadPending?: boolean }> {
  const [existing] = await db
    .select()
    .from(postLockJobsTable)
    .where(
      and(
        eq(postLockJobsTable.workspaceId, workspaceId),
        eq(postLockJobsTable.jobType, "upload_locked_pre_thesis_docx"),
        or(
          eq(postLockJobsTable.status, "pending"),
          eq(postLockJobsTable.status, "processing"),
          eq(postLockJobsTable.status, "completed"),
        ),
      ),
    )
    .limit(1);

  if (existing?.status === "completed" && existing.vaultResourceId) {
    return { jobId: existing.id, vaultResourceId: existing.vaultResourceId };
  }

  let jobId = existing?.id;
  if (!jobId) {
    const [job] = await db
      .insert(postLockJobsTable)
      .values({
        workspaceId,
        jobType: "upload_locked_pre_thesis_docx",
        status: "pending",
        metadata: lockEventId ? { lockEventId } : null,
      })
      .returning();
    jobId = job!.id;
  }

  try {
    const vaultResourceId = await runPostLockVaultUpload(workspaceId, userId, jobId);
    return { jobId, vaultResourceId };
  } catch (err) {
    logger.warn({ err, workspaceId, jobId }, "Post-lock vault upload deferred to retry");
    return { jobId, uploadPending: true };
  }
}

export async function runPostLockVaultUpload(
  workspaceId: number,
  userId: number,
  jobId: number,
): Promise<number> {
  const [job] = await db
    .select()
    .from(postLockJobsTable)
    .where(eq(postLockJobsTable.id, jobId))
    .limit(1);

  if (!job || job.workspaceId !== workspaceId) {
    throw new Error("Post-lock job not found");
  }

  if (job.status === "completed" && job.vaultResourceId) {
    return job.vaultResourceId;
  }

  await db
    .update(postLockJobsTable)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(postLockJobsTable.id, jobId));

  try {
    if (!isStorageConfigured()) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Storage not configured");
      }
      assertStorageConfigured();
    }

    const [ws] = await db
      .select()
      .from(workspacesTable)
      .where(eq(workspacesTable.id, workspaceId))
      .limit(1);

    if (!ws) throw new Error("Workspace not found");

    const buildVersion = ws.preThesisBuildVersion ?? 1;
    const vaultTitle = `Pre-Thesis Locked DOCX — ${ws.title} — v${buildVersion}`;
    const filename = `pre-thesis-locked-${workspaceId}-v${buildVersion}.docx`;

    const buffer = await buildPreThesisDocxBuffer(workspaceId);
    const mimeType =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    let resourceId = job.vaultResourceId ?? undefined;

    if (!resourceId) {
      const [resource] = await db
        .insert(vaultResourcesTable)
        .values({
          workspaceId,
          type: "paper",
          title: vaultTitle,
          processingStatus: "pending",
          mimeType,
        })
        .returning();
      resourceId = resource!.id;
    }

    const storagePath = await uploadVaultFile(workspaceId, resourceId, filename, buffer, mimeType);

    await db
      .update(vaultResourcesTable)
      .set({
        title: vaultTitle,
        storagePath,
        processingStatus: "ready",
        updatedAt: new Date(),
      })
      .where(eq(vaultResourcesTable.id, resourceId));

    await db
      .update(postLockJobsTable)
      .set({
        status: "completed",
        vaultResourceId: resourceId,
        completedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(postLockJobsTable.id, jobId));

    await db.insert(activityEventsTable).values({
      userId,
      workspaceId,
      type: "vault_resource_added",
      description: `Locked pre-thesis DOCX saved to Research Vault: "${vaultTitle}"`,
    });

    return resourceId;
  } catch (err) {
    const attempts = (job.attempts ?? 0) + 1;
    const maxAttempts = job.maxAttempts ?? 5;
    const message = err instanceof Error ? err.message : "Upload failed";
    const failed = attempts >= maxAttempts;
    const delayMs = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]!;

    await db
      .update(postLockJobsTable)
      .set({
        status: failed ? "failed" : "pending",
        attempts,
        lastError: message,
        nextRetryAt: failed ? null : new Date(Date.now() + delayMs),
        updatedAt: new Date(),
      })
      .where(eq(postLockJobsTable.id, jobId));

    if (failed) {
      await db.insert(activityEventsTable).values({
        userId,
        workspaceId,
        type: "vault_resource_added",
        description: `Locked pre-thesis DOCX vault upload failed after ${attempts} attempts`,
      });
    }

    throw err;
  }
}

export async function processPendingPostLockJobs(limit = 10): Promise<number> {
  const now = new Date();
  const pending = await db
    .select()
    .from(postLockJobsTable)
    .where(
      and(
        eq(postLockJobsTable.jobType, "upload_locked_pre_thesis_docx"),
        or(eq(postLockJobsTable.status, "pending"), eq(postLockJobsTable.status, "failed")),
        sql`(${postLockJobsTable.nextRetryAt} IS NULL OR ${postLockJobsTable.nextRetryAt} <= ${now})`,
        sql`${postLockJobsTable.attempts} < ${postLockJobsTable.maxAttempts}`,
      ),
    )
    .limit(limit);

  let processed = 0;
  for (const job of pending) {
    if (job.attempts >= job.maxAttempts) continue;
    try {
      const [ws] = await db
        .select({ userId: workspacesTable.userId })
        .from(workspacesTable)
        .where(eq(workspacesTable.id, job.workspaceId))
        .limit(1);
      if (!ws) continue;
      await runPostLockVaultUpload(job.workspaceId, ws.userId, job.id);
      processed++;
    } catch {
      /* retry scheduled */
    }
  }
  return processed;
}
