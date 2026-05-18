import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  sectionsTable,
  workspacesTable,
  activityEventsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, getClerkUserId, getOrCreateDbUser } from "../lib/auth";
import {
  ListSectionsParams,
  ListSectionsResponse,
  CreateSectionParams,
  CreateSectionBody,
  GetSectionParams,
  GetSectionResponse,
  UpdateSectionParams,
  UpdateSectionBody,
  UpdateSectionResponse,
  DeleteSectionParams,
  ReorderSectionsParams,
  ReorderSectionsBody,
  ReorderSectionsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function sectionToResponse(s: typeof sectionsTable.$inferSelect) {
  return {
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    content: s.content ?? null,
    notes: s.notes ?? null,
    wordCount: s.wordCount ?? null,
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

router.get("/workspaces/:workspaceId/sections", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getClerkUserId(req);
  const dbUser = await getOrCreateDbUser(clerkUserId);
  if (!dbUser) { res.json([]); return; }

  const params = ListSectionsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const ws = await verifyWorkspaceOwnership(params.data.workspaceId, dbUser.id);
  if (!ws) { res.status(404).json({ error: "Workspace not found" }); return; }

  const sections = await db
    .select()
    .from(sectionsTable)
    .where(eq(sectionsTable.workspaceId, params.data.workspaceId))
    .orderBy(sectionsTable.order);

  res.json(ListSectionsResponse.parse(sections.map(sectionToResponse)));
});

router.post("/workspaces/:workspaceId/sections", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getClerkUserId(req);
  const dbUser = await getOrCreateDbUser(clerkUserId);
  if (!dbUser) { res.status(404).json({ error: "User not found" }); return; }

  const params = CreateSectionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = CreateSectionBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const ws = await verifyWorkspaceOwnership(params.data.workspaceId, dbUser.id);
  if (!ws) { res.status(404).json({ error: "Workspace not found" }); return; }

  const [maxOrderRow] = await db
    .select({ maxOrder: sql<number>`max(${sectionsTable.order})` })
    .from(sectionsTable)
    .where(eq(sectionsTable.workspaceId, params.data.workspaceId));

  const nextOrder = (maxOrderRow?.maxOrder ?? -1) + 1;

  const [section] = await db
    .insert(sectionsTable)
    .values({
      ...body.data,
      workspaceId: params.data.workspaceId,
      order: body.data.order ?? nextOrder,
    })
    .returning();

  await db.insert(activityEventsTable).values({
    userId: dbUser.id,
    workspaceId: ws.id,
    type: "section_created",
    description: `Added section "${section!.title}" to "${ws.title}"`,
  });

  res.status(201).json(sectionToResponse(section!));
});

router.get("/workspaces/:workspaceId/sections/:sectionId", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getClerkUserId(req);
  const dbUser = await getOrCreateDbUser(clerkUserId);
  if (!dbUser) { res.status(404).json({ error: "User not found" }); return; }

  const params = GetSectionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const ws = await verifyWorkspaceOwnership(params.data.workspaceId, dbUser.id);
  if (!ws) { res.status(404).json({ error: "Workspace not found" }); return; }

  const [section] = await db
    .select()
    .from(sectionsTable)
    .where(eq(sectionsTable.id, params.data.sectionId))
    .limit(1);

  if (!section || section.workspaceId !== params.data.workspaceId) {
    res.status(404).json({ error: "Section not found" }); return;
  }

  res.json(GetSectionResponse.parse(sectionToResponse(section)));
});

router.patch("/workspaces/:workspaceId/sections/:sectionId", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getClerkUserId(req);
  const dbUser = await getOrCreateDbUser(clerkUserId);
  if (!dbUser) { res.status(404).json({ error: "User not found" }); return; }

  const params = UpdateSectionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = UpdateSectionBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const ws = await verifyWorkspaceOwnership(params.data.workspaceId, dbUser.id);
  if (!ws) { res.status(404).json({ error: "Workspace not found" }); return; }

  const updateData: Partial<typeof sectionsTable.$inferInsert> = { ...body.data, updatedAt: new Date() };

  if (body.data.content !== undefined) {
    const wordCount = body.data.content
      ? body.data.content.trim().split(/\s+/).filter(Boolean).length
      : 0;
    updateData.wordCount = wordCount;
  }

  const [updated] = await db
    .update(sectionsTable)
    .set(updateData)
    .where(eq(sectionsTable.id, params.data.sectionId))
    .returning();

  if (!updated || updated.workspaceId !== params.data.workspaceId) {
    res.status(404).json({ error: "Section not found" }); return;
  }

  if (body.data.status === "completed") {
    await db.insert(activityEventsTable).values({
      userId: dbUser.id,
      workspaceId: ws.id,
      type: "section_completed",
      description: `Completed section "${updated.title}" in "${ws.title}"`,
    });
  }

  res.json(UpdateSectionResponse.parse(sectionToResponse(updated)));
});

router.delete("/workspaces/:workspaceId/sections/:sectionId", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getClerkUserId(req);
  const dbUser = await getOrCreateDbUser(clerkUserId);
  if (!dbUser) { res.status(404).json({ error: "User not found" }); return; }

  const params = DeleteSectionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const ws = await verifyWorkspaceOwnership(params.data.workspaceId, dbUser.id);
  if (!ws) { res.status(404).json({ error: "Workspace not found" }); return; }

  const [deleted] = await db
    .delete(sectionsTable)
    .where(eq(sectionsTable.id, params.data.sectionId))
    .returning();

  if (!deleted || deleted.workspaceId !== params.data.workspaceId) {
    res.status(404).json({ error: "Section not found" }); return;
  }

  res.sendStatus(204);
});

router.post("/workspaces/:workspaceId/sections/reorder", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getClerkUserId(req);
  const dbUser = await getOrCreateDbUser(clerkUserId);
  if (!dbUser) { res.status(404).json({ error: "User not found" }); return; }

  const params = ReorderSectionsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = ReorderSectionsBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const ws = await verifyWorkspaceOwnership(params.data.workspaceId, dbUser.id);
  if (!ws) { res.status(404).json({ error: "Workspace not found" }); return; }

  await Promise.all(
    body.data.orderedIds.map((id, index) =>
      db.update(sectionsTable).set({ order: index }).where(eq(sectionsTable.id, id)),
    ),
  );

  const sections = await db
    .select()
    .from(sectionsTable)
    .where(eq(sectionsTable.workspaceId, params.data.workspaceId))
    .orderBy(sectionsTable.order);

  res.json(ReorderSectionsResponse.parse(sections.map(sectionToResponse)));
});

export default router;
