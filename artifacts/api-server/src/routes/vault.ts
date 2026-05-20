import { Router, type IRouter } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import {
  vaultResourcesTable,
  workspacesTable,
  activityEventsTable,
  eq,
  count,
  sql,
} from "@workspace/db";
import { requireAuth, requireDbUser } from "../lib/auth";
import {
  ListVaultResourcesParams,
  ListVaultResourcesResponse,
  CreateVaultResourceParams,
  CreateVaultResourceBody,
  GetVaultSummaryParams,
  GetVaultSummaryResponse,
  GetVaultResourceParams,
  GetVaultResourceResponse,
  UpdateVaultResourceParams,
  UpdateVaultResourceBody,
  UpdateVaultResourceResponse,
  DeleteVaultResourceParams,
} from "@workspace/api-zod";
import {
  isStorageConfigured,
  uploadVaultFile,
  createSignedDownloadUrl,
  assertStorageConfigured,
} from "../lib/supabaseStorage";
import { loadVaultAiContext } from "../lib/loadVaultForAi";
import { catalogToArray } from "@workspace/vault-citations";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const router: IRouter = Router();

function vaultToResponse(r: typeof vaultResourcesTable.$inferSelect) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    content: r.content ?? null,
    url: r.url ?? null,
    authors: r.authors ?? null,
    year: r.year ?? null,
    journal: r.journal ?? null,
    doi: r.doi ?? null,
    tags: r.tags ?? null,
    storagePath: r.storagePath ?? null,
    mimeType: r.mimeType ?? null,
    processingStatus: r.processingStatus ?? "ready",
  };
}

async function verifyWorkspaceOwnership(workspaceId: number, userId: number) {
  const [ws] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);
  return ws && ws.userId === userId ? ws : null;
}

router.get(
  "/workspaces/:workspaceId/vault",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

        const params = ListVaultResourcesParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const ws = await verifyWorkspaceOwnership(params.data.workspaceId, dbUser.id);
    if (!ws) { res.status(404).json({ error: "Workspace not found" }); return; }

    const resources = await db
      .select()
      .from(vaultResourcesTable)
      .where(eq(vaultResourcesTable.workspaceId, params.data.workspaceId))
      .orderBy(sql`${vaultResourcesTable.createdAt} desc`);

    res.json(ListVaultResourcesResponse.parse(resources.map(vaultToResponse)));
  },
);

router.post(
  "/workspaces/:workspaceId/vault",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

        const params = CreateVaultResourceParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const body = CreateVaultResourceBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const ws = await verifyWorkspaceOwnership(params.data.workspaceId, dbUser.id);
    if (!ws) { res.status(404).json({ error: "Workspace not found" }); return; }

    const [resource] = await db
      .insert(vaultResourcesTable)
      .values({ ...body.data, workspaceId: params.data.workspaceId })
      .returning();

    await db.insert(activityEventsTable).values({
      userId: dbUser.id,
      workspaceId: ws.id,
      type: "vault_resource_added",
      description: `Added ${resource!.type} "${resource!.title}" to vault in "${ws.title}"`,
    });

    res.status(201).json(vaultToResponse(resource!));
  },
);

router.post(
  "/workspaces/:workspaceId/vault/upload",
  requireAuth,
  upload.single("file"),
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const ws = await verifyWorkspaceOwnership(workspaceId, dbUser.id);
    if (!ws) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    if (!isStorageConfigured()) {
      if (process.env.NODE_ENV === "production") {
        res.status(503).json({ error: "Storage not configured" });
        return;
      }
      assertStorageConfigured();
    }

    const title = (req.body.title as string) || file.originalname;
    const type =
      (req.body.type as "paper" | "note" | "reference" | "image" | "link") ||
      (file.mimetype.startsWith("image/") ? "image" : "paper");

    const [resource] = await db
      .insert(vaultResourcesTable)
      .values({
        workspaceId,
        type,
        title,
        processingStatus: "pending",
        mimeType: file.mimetype,
      })
      .returning();

    try {
      const storagePath = await uploadVaultFile(
        workspaceId,
        resource!.id,
        file.originalname,
        file.buffer,
        file.mimetype,
      );
      const [updated] = await db
        .update(vaultResourcesTable)
        .set({
          storagePath,
          processingStatus: "ready",
          updatedAt: new Date(),
        })
        .where(eq(vaultResourcesTable.id, resource!.id))
        .returning();

      const downloadUrl = await createSignedDownloadUrl(storagePath, 3600, "vault");

      await db.insert(activityEventsTable).values({
        userId: dbUser.id,
        workspaceId: ws.id,
        type: "vault_resource_added",
        description: `Uploaded file "${title}" to vault`,
      });

      res.status(201).json({
        ...vaultToResponse(updated!),
        downloadUrl,
      });
    } catch (err) {
      await db
        .update(vaultResourcesTable)
        .set({ processingStatus: "failed", updatedAt: new Date() })
        .where(eq(vaultResourcesTable.id, resource!.id));
      res.status(500).json({
        error: err instanceof Error ? err.message : "Upload failed",
      });
    }
  },
);

router.get(
  "/workspaces/:workspaceId/vault/summary",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

        const params = GetVaultSummaryParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const ws = await verifyWorkspaceOwnership(params.data.workspaceId, dbUser.id);
    if (!ws) { res.status(404).json({ error: "Workspace not found" }); return; }

    const [totals] = await db
      .select({
        total: count(),
        paper: sql<number>`count(*) filter (where ${vaultResourcesTable.type} = 'paper')`,
        note: sql<number>`count(*) filter (where ${vaultResourcesTable.type} = 'note')`,
        reference: sql<number>`count(*) filter (where ${vaultResourcesTable.type} = 'reference')`,
        image: sql<number>`count(*) filter (where ${vaultResourcesTable.type} = 'image')`,
        link: sql<number>`count(*) filter (where ${vaultResourcesTable.type} = 'link')`,
      })
      .from(vaultResourcesTable)
      .where(eq(vaultResourcesTable.workspaceId, params.data.workspaceId));

    const recentResources = await db
      .select()
      .from(vaultResourcesTable)
      .where(eq(vaultResourcesTable.workspaceId, params.data.workspaceId))
      .orderBy(sql`${vaultResourcesTable.createdAt} desc`)
      .limit(5);

    res.json(
      GetVaultSummaryResponse.parse({
        total: Number(totals?.total ?? 0),
        byType: {
          paper: Number(totals?.paper ?? 0),
          note: Number(totals?.note ?? 0),
          reference: Number(totals?.reference ?? 0),
          image: Number(totals?.image ?? 0),
          link: Number(totals?.link ?? 0),
        },
        recentResources: recentResources.map(vaultToResponse),
      }),
    );
  },
);

/** Citation catalog for editor UI (same [V1] keys as AI). */
router.get(
  "/workspaces/:workspaceId/vault/citation-catalog",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    if (isNaN(workspaceId)) {
      res.status(400).json({ error: "Invalid workspace id" });
      return;
    }

    const ws = await verifyWorkspaceOwnership(workspaceId, dbUser.id);
    if (!ws) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    const vaultCtx = await loadVaultAiContext(workspaceId);
    res.json({
      resourceCount: vaultCtx.resourceCount,
      catalog: catalogToArray(vaultCtx.catalog),
    });
  },
);

router.get(
  "/workspaces/:workspaceId/vault/:resourceId",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

        const params = GetVaultResourceParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const ws = await verifyWorkspaceOwnership(params.data.workspaceId, dbUser.id);
    if (!ws) { res.status(404).json({ error: "Workspace not found" }); return; }

    const [resource] = await db
      .select()
      .from(vaultResourcesTable)
      .where(eq(vaultResourcesTable.id, params.data.resourceId))
      .limit(1);

    if (!resource || resource.workspaceId !== params.data.workspaceId) {
      res.status(404).json({ error: "Resource not found" }); return;
    }

    res.json(GetVaultResourceResponse.parse(vaultToResponse(resource)));
  },
);

router.patch(
  "/workspaces/:workspaceId/vault/:resourceId",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

        const params = UpdateVaultResourceParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const body = UpdateVaultResourceBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const ws = await verifyWorkspaceOwnership(params.data.workspaceId, dbUser.id);
    if (!ws) { res.status(404).json({ error: "Workspace not found" }); return; }

    const [updated] = await db
      .update(vaultResourcesTable)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(vaultResourcesTable.id, params.data.resourceId))
      .returning();

    if (!updated || updated.workspaceId !== params.data.workspaceId) {
      res.status(404).json({ error: "Resource not found" }); return;
    }

    res.json(UpdateVaultResourceResponse.parse(vaultToResponse(updated)));
  },
);

router.delete(
  "/workspaces/:workspaceId/vault/:resourceId",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

        const params = DeleteVaultResourceParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const ws = await verifyWorkspaceOwnership(params.data.workspaceId, dbUser.id);
    if (!ws) { res.status(404).json({ error: "Workspace not found" }); return; }

    const [deleted] = await db
      .delete(vaultResourcesTable)
      .where(eq(vaultResourcesTable.id, params.data.resourceId))
      .returning();

    if (!deleted || deleted.workspaceId !== params.data.workspaceId) {
      res.status(404).json({ error: "Resource not found" }); return;
    }

    res.sendStatus(204);
  },
);

export default router;
