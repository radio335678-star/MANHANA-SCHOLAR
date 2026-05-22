import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  workspacesTable,
  sectionsTable,
  activityEventsTable,
  eq,
  count,
  sql,
  and,
} from "@workspace/db";
import { requireAuth, requireDbUser } from "../lib/auth";
import { mapWorkspaceRow, mapWorkspaceListRow } from "../lib/workspaceMapper";
import {
  FREE_TIER_ACTIVE_WORKSPACE_LIMIT,
  workspaceLimitError,
} from "../lib/workspaceLimits";
import { deleteWorkspaceStorage } from "../lib/supabaseStorage";
import { logger } from "../lib/logger";
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

  return mapWorkspaceRow({
    ...ws,
    totalSections: Number(total),
    completedSections: Number(completed),
  });
}

router.get("/workspaces", requireAuth, async (req, res): Promise<void> => {
  const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

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
      return mapWorkspaceListRow({
        ...ws,
        totalSections: Number(total),
        completedSections: Number(completed),
      });
    }),
  );

  res.json(ListWorkspacesResponse.parse(withCounts));
});

router.post("/workspaces", requireAuth, async (req, res): Promise<void> => {
  const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

      const parsed = CreateWorkspaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [{ activeCount }] = await db
    .select({ activeCount: count() })
    .from(workspacesTable)
    .where(
      and(
        eq(workspacesTable.userId, dbUser.id),
        eq(workspacesTable.status, "active"),
      ),
    );

  if (Number(activeCount) >= FREE_TIER_ACTIVE_WORKSPACE_LIMIT) {
    res.status(403).json(workspaceLimitError(FREE_TIER_ACTIVE_WORKSPACE_LIMIT));
    return;
  }

  const extra = req.body as Record<string, unknown>;
  const [ws] = await db
    .insert(workspacesTable)
    .values({
      ...parsed.data,
      userId: dbUser.id,
      ownerUuid: req.auth?.supabaseUserId ?? dbUser.supabaseUserId ?? null,
      ...(typeof extra.departmentId === "number" ? { departmentId: extra.departmentId } : {}),
      ...(typeof extra.candidateName === "string" ? { candidateName: extra.candidateName } : {}),
      ...(typeof extra.hodName === "string" ? { hodName: extra.hodName } : {}),
      ...(typeof extra.studyType === "string" ? { studyType: extra.studyType } : {}),
      ...(extra.preThesisChecklist &&
      typeof extra.preThesisChecklist === "object" &&
      !Array.isArray(extra.preThesisChecklist)
        ? { preThesisChecklist: extra.preThesisChecklist as Record<string, boolean> }
        : {}),
      ...(typeof extra.researchNotes === "string" && extra.researchNotes.trim()
        ? { researchNotes: extra.researchNotes.trim() }
        : {}),
      ...(extra.datasetMasterChartPlan &&
      typeof extra.datasetMasterChartPlan === "object" &&
      !Array.isArray(extra.datasetMasterChartPlan)
        ? { datasetMasterChartPlan: extra.datasetMasterChartPlan as Record<string, unknown> }
        : {}),
    })
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
  const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

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
  const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

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
  const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

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

  try {
    await deleteWorkspaceStorage(params.data.id);
  } catch (err) {
    logger.warn({ err, workspaceId: params.data.id }, "Workspace storage cleanup failed; continuing delete");
  }

  await db.delete(workspacesTable).where(eq(workspacesTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/workspaces/:id/progress", requireAuth, async (req, res): Promise<void> => {
  const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

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
