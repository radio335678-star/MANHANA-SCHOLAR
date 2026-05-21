import { Router, type IRouter } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import {
  workspacesTable,
  preThesisBuildJobsTable,
  preThesisSourcesTable,
  preThesisConflictsTable,
  vaultResourcesTable,
  activityEventsTable,
  eq,
  and,
  desc,
} from "@workspace/db";
import {
  assertStorageConfigured,
  isStorageConfigured,
  uploadVaultFile,
} from "../lib/supabaseStorage";
import { requireAuth, requireDbUser } from "../lib/auth";
import { runPreThesisBuild, type TelemetryEvent } from "../services/preThesisOrchestrator";
import { lockPreThesis, unlockPreThesis } from "../services/lockIn";
import { isWorkflowState } from "../types/workflow";
import { extractSynopsisText } from "../lib/synopsisExtract";
import { buildPreThesisDocxBuffer } from "../services/preThesisDocxBuffer";
import {
  PreThesisExportError,
  preThesisExportHttpStatus,
} from "../services/preThesisExportError";
import { z } from "zod";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const PatchPreThesisBody = z.object({
  preThesisChecklist: z.record(z.string(), z.boolean()).optional(),
  researchNotes: z.string().optional(),
  preThesisDraftMd: z.string().optional(),
  candidateName: z.string().optional(),
  hodName: z.string().optional(),
  studyType: z.string().optional(),
  departmentId: z.number().int().positive().optional(),
});

const LockBody = z.object({
  confirm: z.literal(true).optional(),
});

const UnlockBody = z.object({
  confirm: z.boolean(),
});

const ResolveConflictBody = z.object({
  appliedValue: z.string(),
});

async function verifyOwnership(workspaceId: number, userId: number) {
  const [ws] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);
  if (!ws || ws.userId !== userId) return null;
  return ws;
}

router.get("/workspaces/:id/pre-thesis", requireAuth, async (req, res): Promise<void> => {
  const dbUser = await requireDbUser(req, res);
  if (!dbUser) return;

  const workspaceId = parseInt(String(req.params.id), 10);
  const ws = await verifyOwnership(workspaceId, dbUser.id);
  if (!ws) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const sources = await db
    .select()
    .from(preThesisSourcesTable)
    .where(eq(preThesisSourcesTable.workspaceId, workspaceId))
    .orderBy(desc(preThesisSourcesTable.fetchedAt))
    .limit(50);

  const conflicts = await db
    .select()
    .from(preThesisConflictsTable)
    .where(eq(preThesisConflictsTable.workspaceId, workspaceId));

  const [lastJob] = await db
    .select()
    .from(preThesisBuildJobsTable)
    .where(eq(preThesisBuildJobsTable.workspaceId, workspaceId))
    .orderBy(desc(preThesisBuildJobsTable.createdAt))
    .limit(1);

  const state = isWorkflowState(ws.workflowState) ? ws.workflowState : "init";
  const isLocked = state === "locked_in" || Boolean(ws.preThesisMdHash);

  res.json({
    workspaceId,
    workflowState: state,
    isLocked,
    buildVersion: ws.preThesisBuildVersion ?? 1,
    preThesisDraftMd: isLocked ? null : ws.preThesisDraftMd,
    preThesisLockedMd: ws.preThesisLockedMd,
    preThesisMdHash: ws.preThesisMdHash,
    preThesisChecklist: ws.preThesisChecklist ?? {},
    researchNotes: ws.researchNotes,
    synopsisText: ws.synopsisText ? `${ws.synopsisText.slice(0, 500)}…` : null,
    hasSynopsis: Boolean(ws.synopsisText?.trim()),
    departmentId: ws.departmentId,
    candidateName: ws.candidateName,
    hodName: ws.hodName,
    studyType: ws.studyType,
    lastLiveVerifiedAt: ws.lastLiveVerifiedAt?.toISOString() ?? null,
    lockedAt: ws.lockedAt?.toISOString() ?? null,
    resultJson: lastJob?.resultJson ?? null,
    warnings: (lastJob?.warnings as string[]) ?? [],
    completenessScore: lastJob?.completenessScore ?? null,
    sources: sources.map((s) => ({
      ...s,
      fetchedAt: s.fetchedAt.toISOString(),
    })),
    conflicts: conflicts.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
    })),
  });
});

router.patch("/workspaces/:id/pre-thesis", requireAuth, async (req, res): Promise<void> => {
  const dbUser = await requireDbUser(req, res);
  if (!dbUser) return;

  const workspaceId = parseInt(String(req.params.id), 10);
  const ws = await verifyOwnership(workspaceId, dbUser.id);
  if (!ws) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  if (ws.preThesisMdHash) {
    res.status(403).json({ error: "Pre-thesis is locked; unlock to edit" });
    return;
  }

  const parsed = PatchPreThesisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(workspacesTable)
    .set({
      ...(parsed.data.preThesisChecklist !== undefined
        ? { preThesisChecklist: parsed.data.preThesisChecklist }
        : {}),
      ...(parsed.data.researchNotes !== undefined ? { researchNotes: parsed.data.researchNotes } : {}),
      ...(parsed.data.preThesisDraftMd !== undefined
        ? { preThesisDraftMd: parsed.data.preThesisDraftMd }
        : {}),
      ...(parsed.data.candidateName !== undefined ? { candidateName: parsed.data.candidateName } : {}),
      ...(parsed.data.hodName !== undefined ? { hodName: parsed.data.hodName } : {}),
      ...(parsed.data.studyType !== undefined ? { studyType: parsed.data.studyType } : {}),
      ...(parsed.data.departmentId !== undefined ? { departmentId: parsed.data.departmentId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(workspacesTable.id, workspaceId))
    .returning();

  res.json({ ok: true, updatedAt: updated!.updatedAt.toISOString() });
});

router.post(
  "/workspaces/:id/pre-thesis/synopsis",
  requireAuth,
  upload.single("file"),
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.id), 10);
    const ws = await verifyOwnership(workspaceId, dbUser.id);
    if (!ws) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    if (ws.preThesisMdHash) {
      res.status(403).json({ error: "Cannot upload synopsis while locked" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const text = await extractSynopsisText(file.buffer, file.mimetype, file.originalname);

    await db
      .update(workspacesTable)
      .set({
        synopsisText: text,
        updatedAt: new Date(),
      })
      .where(eq(workspacesTable.id, workspaceId));

    const saveToVault = req.query.saveToVault !== "false";
    let vaultResourceId: number | undefined;

    if (saveToVault && isStorageConfigured()) {
      try {
        assertStorageConfigured();
        const vaultTitle = `Synopsis — ${ws.title}`;
        const [resource] = await db
          .insert(vaultResourcesTable)
          .values({
            workspaceId,
            type: "paper",
            title: vaultTitle,
            processingStatus: "pending",
            mimeType: file.mimetype,
          })
          .returning();

        const storagePath = await uploadVaultFile(
          workspaceId,
          resource!.id,
          file.originalname,
          file.buffer,
          file.mimetype,
        );

        await db
          .update(vaultResourcesTable)
          .set({
            storagePath,
            processingStatus: "ready",
            updatedAt: new Date(),
          })
          .where(eq(vaultResourcesTable.id, resource!.id));

        vaultResourceId = resource!.id;

        await db.insert(activityEventsTable).values({
          userId: dbUser.id,
          workspaceId,
          type: "vault_resource_added",
          description: `Synopsis saved to Research Vault: "${vaultTitle}"`,
        });
      } catch {
        /* synopsis text still saved; vault is best-effort */
      }
    }

    res.json({
      ok: true,
      charCount: text.length,
      preview: text.slice(0, 300),
      vaultResourceId,
    });
  },
);

router.get("/workspaces/:id/pre-thesis/export.docx", requireAuth, async (req, res): Promise<void> => {
  const dbUser = await requireDbUser(req, res);
  if (!dbUser) return;

  const workspaceId = parseInt(String(req.params.id), 10);
  const ws = await verifyOwnership(workspaceId, dbUser.id);
  if (!ws) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  try {
    const buffer = await buildPreThesisDocxBuffer(workspaceId);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="pre-thesis-${workspaceId}.docx"`,
    );
    res.send(buffer);
  } catch (err) {
    if (err instanceof PreThesisExportError) {
      res.status(preThesisExportHttpStatus(err.code)).json({ error: err.message, code: err.code });
      return;
    }
    res.status(400).json({
      error: err instanceof Error ? err.message : "No pre-thesis document to export",
    });
  }
});

router.post("/workspaces/:id/pre-thesis/build", requireAuth, async (req, res): Promise<void> => {
  const dbUser = await requireDbUser(req, res);
  if (!dbUser) return;

  const workspaceId = parseInt(String(req.params.id), 10);
  const ws = await verifyOwnership(workspaceId, dbUser.id);
  if (!ws) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  if (ws.preThesisMdHash) {
    res.status(403).json({ error: "Cannot rebuild while locked" });
    return;
  }

  const idempotencyKey =
    typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : undefined;

  const [job] = await db
    .insert(preThesisBuildJobsTable)
    .values({
      workspaceId,
      status: "queued",
      buildVersion: 2,
      idempotencyKey: idempotencyKey ?? null,
    })
    .returning();

  res.status(202).json({ jobId: job!.id, status: "queued", buildVersion: 2 });

  setImmediate(() => {
    void runPreThesisBuild(workspaceId, job!.id).catch(() => undefined);
  });
});

router.get(
  "/workspaces/:id/pre-thesis/build/:jobId/stream",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.id), 10);
    const jobId = parseInt(String(req.params.jobId), 10);
    const ws = await verifyOwnership(workspaceId, dbUser.id);
    if (!ws) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (event: TelemetryEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    let lastLen = 0;
    const poll = setInterval(async () => {
      const [job] = await db
        .select()
        .from(preThesisBuildJobsTable)
        .where(
          and(
            eq(preThesisBuildJobsTable.id, jobId),
            eq(preThesisBuildJobsTable.workspaceId, workspaceId),
          ),
        )
        .limit(1);

      if (!job) {
        send({ type: "error", message: "Job not found", timestamp: new Date().toISOString() });
        clearInterval(poll);
        res.end();
        return;
      }

      const telemetry = (job.telemetry as TelemetryEvent[]) ?? [];
      for (let i = lastLen; i < telemetry.length; i++) {
        send(telemetry[i]!);
      }
      lastLen = telemetry.length;

      if (job.status === "completed" || job.status === "failed") {
        if (job.status === "failed") {
          send({
            type: "error",
            message: job.error ?? "Build failed",
            timestamp: new Date().toISOString(),
          });
        }
        clearInterval(poll);
        res.end();
      }
    }, 500);

    req.on("close", () => clearInterval(poll));

    const [existing] = await db
      .select()
      .from(preThesisBuildJobsTable)
      .where(eq(preThesisBuildJobsTable.id, jobId))
      .limit(1);

    if (existing?.status === "queued") {
      void runPreThesisBuild(workspaceId, jobId, send);
    }
  },
);

router.post("/workspaces/:id/pre-thesis/revalidate", requireAuth, async (req, res): Promise<void> => {
  const dbUser = await requireDbUser(req, res);
  if (!dbUser) return;

  const workspaceId = parseInt(String(req.params.id), 10);
  const ws = await verifyOwnership(workspaceId, dbUser.id);
  if (!ws) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  if (ws.preThesisMdHash) {
    res.status(403).json({ error: "Cannot revalidate while locked" });
    return;
  }

  const [job] = await db
    .insert(preThesisBuildJobsTable)
    .values({ workspaceId, status: "queued", buildVersion: 2 })
    .returning();

  res.status(202).json({ jobId: job!.id, buildVersion: 2 });
  setImmediate(() => {
    void runPreThesisBuild(workspaceId, job!.id).catch(() => undefined);
  });
});

router.post(
  "/workspaces/:id/pre-thesis/conflicts/:conflictId/resolve",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.id), 10);
    const conflictId = parseInt(String(req.params.conflictId), 10);
    const ws = await verifyOwnership(workspaceId, dbUser.id);
    if (!ws) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    const parsed = ResolveConflictBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [updated] = await db
      .update(preThesisConflictsTable)
      .set({
        resolved: true,
        appliedValue: parsed.data.appliedValue,
      })
      .where(
        and(
          eq(preThesisConflictsTable.id, conflictId),
          eq(preThesisConflictsTable.workspaceId, workspaceId),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Conflict not found" });
      return;
    }

    res.json({ ok: true, conflictId });
  },
);

router.post("/workspaces/:id/pre-thesis/lock", requireAuth, async (req, res): Promise<void> => {
  const dbUser = await requireDbUser(req, res);
  if (!dbUser) return;

  const workspaceId = parseInt(String(req.params.id), 10);
  const ws = await verifyOwnership(workspaceId, dbUser.id);
  if (!ws) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  try {
    const receipt = await lockPreThesis(workspaceId, dbUser.id);
    res.json(receipt);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Lock failed" });
  }
});

router.post("/workspaces/:id/pre-thesis/unlock", requireAuth, async (req, res): Promise<void> => {
  const dbUser = await requireDbUser(req, res);
  if (!dbUser) return;

  const workspaceId = parseInt(String(req.params.id), 10);
  const ws = await verifyOwnership(workspaceId, dbUser.id);
  if (!ws) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const parsed = UnlockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    await unlockPreThesis(workspaceId, dbUser.id, parsed.data.confirm === true);
    res.json({ ok: true, workflowState: "pre_setup" });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Unlock failed" });
  }
});

export default router;
