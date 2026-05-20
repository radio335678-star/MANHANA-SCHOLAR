import { canonicalizeMd, sha256PreThesisMd } from "../lib/preThesisHash";
import { db } from "@workspace/db";
import {
  workspacesTable,
  preThesisSourcesTable,
  preThesisConflictsTable,
  preThesisLockEventsTable,
  preThesisBuildJobsTable,
  activityEventsTable,
} from "@workspace/db";
import { desc } from "@workspace/db";
import { eq, and } from "@workspace/db";
import {
  uploadText,
  preThesisLockedPath,
  preThesisAuditPath,
  isStorageConfigured,
} from "../lib/supabaseStorage";
import { transitionWorkflow } from "./workflowState";
import { isWorkflowState } from "../types/workflow";
import { enqueuePostLockVaultUpload } from "./postLockVault";

export type LockReceipt = {
  hash: string;
  lockedAt: string;
  sourceCount: number;
  lockEventId: number;
  alreadyLocked?: boolean;
  vaultResourceId?: number;
  vaultUploadPending?: boolean;
};

export async function lockPreThesis(
  workspaceId: number,
  userId: number,
): Promise<LockReceipt> {
  const [ws] = await db.select().from(workspacesTable).where(eq(workspacesTable.id, workspaceId)).limit(1);
  if (!ws || ws.userId !== userId) throw new Error("Workspace not found");

  const state = isWorkflowState(ws.workflowState) ? ws.workflowState : "init";

  if (state === "locked_in" && ws.preThesisMdHash) {
    const sources = await db
      .select()
      .from(preThesisSourcesTable)
      .where(eq(preThesisSourcesTable.workspaceId, workspaceId));

    const [existingEvent] = await db
      .select()
      .from(preThesisLockEventsTable)
      .where(
        and(
          eq(preThesisLockEventsTable.workspaceId, workspaceId),
          eq(preThesisLockEventsTable.mdHash, ws.preThesisMdHash),
        ),
      )
      .orderBy(desc(preThesisLockEventsTable.createdAt))
      .limit(1);

    const vaultResult = await enqueuePostLockVaultUpload(
      workspaceId,
      userId,
      existingEvent?.id,
    ).catch(() => ({ jobId: 0, uploadPending: true }));

    return {
      hash: ws.preThesisMdHash,
      lockedAt: (ws.lockedAt ?? new Date()).toISOString(),
      sourceCount: sources.length,
      lockEventId: existingEvent?.id ?? 0,
      alreadyLocked: true,
      vaultResourceId: vaultResult.vaultResourceId,
      vaultUploadPending: vaultResult.uploadPending,
    };
  }

  if (state !== "pre_setup") {
    throw new Error(`Lock-in requires pre_setup state, current: ${state}`);
  }

  const draft = ws.preThesisDraftMd?.trim();
  if (!draft) throw new Error("Pre-thesis draft must be built before lock-in");

  const buildVersion = ws.preThesisBuildVersion ?? 1;
  if (buildVersion < 2) {
    throw new Error("Rebuild pre-thesis with the latest builder (v2) before lock-in");
  }

  const [lastJob] = await db
    .select()
    .from(preThesisBuildJobsTable)
    .where(eq(preThesisBuildJobsTable.workspaceId, workspaceId))
    .orderBy(desc(preThesisBuildJobsTable.completedAt))
    .limit(1);

  if (lastJob?.completenessScore != null && lastJob.completenessScore < 50) {
    throw new Error(
      `Pre-thesis completeness too low (${lastJob.completenessScore}%). Rebuild or add synopsis before lock-in.`,
    );
  }

  const critical = await db
    .select()
    .from(preThesisConflictsTable)
    .where(
      and(
        eq(preThesisConflictsTable.workspaceId, workspaceId),
        eq(preThesisConflictsTable.resolved, false),
        eq(preThesisConflictsTable.severity, "critical"),
      ),
    );
  if (critical.length > 0) {
    throw new Error("Resolve critical guideline conflicts before lock-in");
  }

  const canonical = canonicalizeMd(draft);
  const hash = sha256PreThesisMd(canonical);
  const lockedAt = new Date();

  const sources = await db
    .select()
    .from(preThesisSourcesTable)
    .where(eq(preThesisSourcesTable.workspaceId, workspaceId));

  const [lockEvent] = await db
    .insert(preThesisLockEventsTable)
    .values({
      workspaceId,
      mdHash: hash,
      lockedByUserId: userId,
    })
    .returning();

  let snapshotPath: string | null = null;
  if (isStorageConfigured() && lockEvent) {
    snapshotPath = preThesisAuditPath(workspaceId, lockEvent.id);
    const { uploadText: upload } = await import("../lib/supabaseStorage");
    await upload(
      snapshotPath,
      JSON.stringify(
        {
          sources: sources.map((s) => ({
            attribution: s.attribution,
            title: s.title,
            url: s.url,
            fetchedAt: s.fetchedAt,
          })),
          buildVersion: ws.preThesisBuildVersion,
          resultJson: lastJob?.resultJson ?? null,
          hash,
        },
        null,
        2,
      ),
    );
    await upload(preThesisLockedPath(workspaceId), canonical);
    await db
      .update(preThesisLockEventsTable)
      .set({ sourceSnapshotPath: snapshotPath })
      .where(eq(preThesisLockEventsTable.id, lockEvent.id));
  }

  await db
    .update(workspacesTable)
    .set({
      preThesisLockedMd: canonical,
      preThesisMdHash: hash,
      lockedAt,
      updatedAt: lockedAt,
    })
    .where(eq(workspacesTable.id, workspaceId));

  await transitionWorkflow(workspaceId, userId, "locked_in", {
    reason: "Pre-thesis locked",
    metadata: { hash },
  });

  await db.insert(activityEventsTable).values({
    userId,
    workspaceId,
    type: "pre_thesis_locked",
    description: `Pre-thesis setup locked (SHA-256: ${hash.slice(0, 12)}…)`,
  });

  const vaultResult = await enqueuePostLockVaultUpload(
    workspaceId,
    userId,
    lockEvent!.id,
  ).catch(() => ({ jobId: 0, uploadPending: true }));

  return {
    hash,
    lockedAt: lockedAt.toISOString(),
    sourceCount: sources.length,
    lockEventId: lockEvent!.id,
    vaultResourceId: vaultResult.vaultResourceId,
    vaultUploadPending: vaultResult.uploadPending,
  };
}

export async function unlockPreThesis(
  workspaceId: number,
  userId: number,
  confirm: boolean,
): Promise<void> {
  if (!confirm) throw new Error("Unlock requires confirm: true");

  const [ws] = await db.select().from(workspacesTable).where(eq(workspacesTable.id, workspaceId)).limit(1);
  if (!ws || ws.userId !== userId) throw new Error("Workspace not found");

  const state = isWorkflowState(ws.workflowState) ? ws.workflowState : "init";
  if (state !== "locked_in") throw new Error("Workspace is not locked");

  await db
    .update(preThesisLockEventsTable)
    .set({ unlockedAt: new Date() })
    .where(
      and(
        eq(preThesisLockEventsTable.workspaceId, workspaceId),
        eq(preThesisLockEventsTable.mdHash, ws.preThesisMdHash ?? ""),
      ),
    );

  await db
    .update(workspacesTable)
    .set({
      preThesisLockedMd: null,
      preThesisMdHash: null,
      lockedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(workspacesTable.id, workspaceId));

  await transitionWorkflow(workspaceId, userId, "pre_setup", {
    reason: "Pre-thesis unlocked",
    unlockConfirmed: true,
    metadata: { voidedLiveVerification: true },
  });

  await db.insert(activityEventsTable).values({
    userId,
    workspaceId,
    type: "pre_thesis_unlocked",
    description: "Pre-thesis setup unlocked — live verification stamp voided",
  });
}

export function computeMdHash(md: string): string {
  return sha256PreThesisMd(canonicalizeMd(md));
}
