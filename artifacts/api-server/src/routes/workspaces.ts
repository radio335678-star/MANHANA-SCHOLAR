import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  workspacesTable,
  sectionsTable,
  activityEventsTable,
} from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { requireAuth, getClerkUserId, getOrCreateDbUser } from "../lib/auth";
import {
  ListWorkspacesQueryParams,
  ListWorkspacesResponse,
  CreateWorkspaceBody,
  GetWorkspaceParams,
  GetWorkspaceResponse,
  UpdateWorkspaceParams,
  UpdateWorkspaceBody,
  UpdateWorkspaceResponse,
  DeleteWorkspaceParams,
  GetWorkspaceProgressParams,
  GetWorkspaceProgressResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getWorkspaceWithCounts(workspaceId: number) {
  const [ws] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);
  if (!ws) return null;

  const [{ total, completed }] = await db
    .select({
      total: count(),
      completed: sql<number>`count(*) filter (where ${sectionsTable.status} = 'completed')`,
    })
    .from(sectionsTable)
    .where(eq(sectionsTable.workspaceId, workspaceId));

  return {
    ...ws,
    createdAt: ws.createdAt.toISOString(),
    updatedAt: ws.updatedAt.toISOString(),
    totalSections: Number(total),
    completedSections: Number(completed),
  };
}

router.get("/workspaces", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getClerkUserId(req);
  const dbUser = await getOrCreateDbUser(clerkUserId);
  if (!dbUser) {
    res.json([]);
    return;
  }

  const parsed = ListWorkspacesQueryParams.safeParse(req.query);
  const status = parsed.success ? parsed.data.status : undefined;

  const query = db
    .select()
    .from(workspacesTable)
    .where(
      status
        ? sql`${workspacesTable.userId} = ${dbUser.id} and ${workspacesTable.status} = ${status}`
        : eq(workspacesTable.userId, dbUser.id),
    )
    .orderBy(sql`${workspacesTable.updatedAt} desc`);

  const workspaces = await query;

  const withCounts = await Promise.all(
    workspaces.map(async (ws) => {
      const [{ total, completed }] = await db
        .select({
          total: count(),
          completed: sql<number>`count(*) filter (where ${sectionsTable.status} = 'completed')`,
        })
        .from(sectionsTable)
        .where(eq(sectionsTable.workspaceId, ws.id));
      return {
        ...ws,
        createdAt: ws.createdAt.toISOString(),
        updatedAt: ws.updatedAt.toISOString(),
        totalSections: Number(total),
        completedSections: Number(completed),
      };
    }),
  );

  res.json(ListWorkspacesResponse.parse(withCounts));
});

router.post("/workspaces", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getClerkUserId(req);
  const dbUser = await getOrCreateDbUser(clerkUserId);
  if (!dbUser) {
    res.status(404).json({ error: "User profile not found. Please complete onboarding first." });
    return;
  }

  const parsed = CreateWorkspaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [ws] = await db
    .insert(workspacesTable)
    .values({ ...parsed.data, userId: dbUser.id })
    .returning();

  await db.insert(activityEventsTable).values({
    userId: dbUser.id,
    workspaceId: ws!.id,
    type: "workspace_created",
    description: `Created workspace "${ws!.title}"`,
  });

  const result = await getWorkspaceWithCounts(ws!.id);
  res.status(201).json(result);
});

router.get("/workspaces/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getClerkUserId(req);
  const dbUser = await getOrCreateDbUser(clerkUserId);
  if (!dbUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const params = GetWorkspaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const ws = await getWorkspaceWithCounts(params.data.id);
  if (!ws || ws.userId !== dbUser.id) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  res.json(GetWorkspaceResponse.parse(ws));
});

router.patch("/workspaces/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getClerkUserId(req);
  const dbUser = await getOrCreateDbUser(clerkUserId);
  if (!dbUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const params = UpdateWorkspaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateWorkspaceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, params.data.id))
    .limit(1);

  if (!existing || existing.userId !== dbUser.id) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  await db
    .update(workspacesTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(workspacesTable.id, params.data.id));

  const result = await getWorkspaceWithCounts(params.data.id);
  res.json(UpdateWorkspaceResponse.parse(result));
});

router.delete("/workspaces/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getClerkUserId(req);
  const dbUser = await getOrCreateDbUser(clerkUserId);
  if (!dbUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const params = DeleteWorkspaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, params.data.id))
    .limit(1);

  if (!existing || existing.userId !== dbUser.id) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  await db.delete(workspacesTable).where(eq(workspacesTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/workspaces/:id/progress", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getClerkUserId(req);
  const dbUser = await getOrCreateDbUser(clerkUserId);
  if (!dbUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const params = GetWorkspaceProgressParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ws] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, params.data.id))
    .limit(1);

  if (!ws || ws.userId !== dbUser.id) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const sections = await db
    .select()
    .from(sectionsTable)
    .where(eq(sectionsTable.workspaceId, ws.id))
    .orderBy(sectionsTable.order);

  const total = sections.length;
  const completed = sections.filter((s) => s.status === "completed").length;
  const inProgress = sections.filter((s) => s.status === "in_progress").length;
  const notStarted = sections.filter((s) => s.status === "not_started").length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  res.json(
    GetWorkspaceProgressResponse.parse({
      workspaceId: ws.id,
      totalSections: total,
      completedSections: completed,
      inProgressSections: inProgress,
      notStartedSections: notStarted,
      percentComplete: percent,
      sections: sections.map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        order: s.order,
        wordCount: s.wordCount ?? null,
      })),
    }),
  );
});

export default router;
