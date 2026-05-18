import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  workspacesTable,
  sectionsTable,
  chatMessagesTable,
  vaultResourcesTable,
  activityEventsTable,
} from "@workspace/db";
import { eq, count, and, sql } from "drizzle-orm";
import { requireAuth, getClerkUserId, getOrCreateDbUser } from "../lib/auth";
import {
  GetDashboardSummaryResponse,
  GetDashboardActivityResponse,
  GetDashboardActivityQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getClerkUserId(req);
  const dbUser = await getOrCreateDbUser(clerkUserId);
  if (!dbUser) {
    res.json(
      GetDashboardSummaryResponse.parse({
        totalWorkspaces: 0,
        activeWorkspaces: 0,
        completedWorkspaces: 0,
        totalSections: 0,
        completedSections: 0,
        totalVaultResources: 0,
        totalChatMessages: 0,
        recentWorkspaces: [],
      }),
    );
    return;
  }

  const [wsStats] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${workspacesTable.status} = 'active')`,
      completed: sql<number>`count(*) filter (where ${workspacesTable.status} = 'completed')`,
    })
    .from(workspacesTable)
    .where(eq(workspacesTable.userId, dbUser.id));

  const workspaceIds = (
    await db
      .select({ id: workspacesTable.id })
      .from(workspacesTable)
      .where(eq(workspacesTable.userId, dbUser.id))
  ).map((r) => r.id);

  let totalSections = 0;
  let completedSections = 0;
  let totalVaultResources = 0;
  let totalChatMessages = 0;

  if (workspaceIds.length > 0) {
    const [secStats] = await db
      .select({
        total: count(),
        completed: sql<number>`count(*) filter (where ${sectionsTable.status} = 'completed')`,
      })
      .from(sectionsTable)
      .where(sql`${sectionsTable.workspaceId} = any(${sql.raw(`ARRAY[${workspaceIds.join(",")}]::int[]`)})`);

    totalSections = Number(secStats?.total ?? 0);
    completedSections = Number(secStats?.completed ?? 0);

    const sectionIds = (
      await db
        .select({ id: sectionsTable.id })
        .from(sectionsTable)
        .where(sql`${sectionsTable.workspaceId} = any(${sql.raw(`ARRAY[${workspaceIds.join(",")}]::int[]`)})`)
    ).map((r) => r.id);

    if (sectionIds.length > 0) {
      const [chatStats] = await db
        .select({ total: count() })
        .from(chatMessagesTable)
        .where(sql`${chatMessagesTable.sectionId} = any(${sql.raw(`ARRAY[${sectionIds.join(",")}]::int[]`)})`);
      totalChatMessages = Number(chatStats?.total ?? 0);
    }

    const [vaultStats] = await db
      .select({ total: count() })
      .from(vaultResourcesTable)
      .where(sql`${vaultResourcesTable.workspaceId} = any(${sql.raw(`ARRAY[${workspaceIds.join(",")}]::int[]`)})`);
    totalVaultResources = Number(vaultStats?.total ?? 0);
  }

  const recentWorkspaces = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.userId, dbUser.id))
    .orderBy(sql`${workspacesTable.updatedAt} desc`)
    .limit(5);

  const workspacesWithCounts = await Promise.all(
    recentWorkspaces.map(async (ws) => {
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

  res.json(
    GetDashboardSummaryResponse.parse({
      totalWorkspaces: Number(wsStats?.total ?? 0),
      activeWorkspaces: Number(wsStats?.active ?? 0),
      completedWorkspaces: Number(wsStats?.completed ?? 0),
      totalSections,
      completedSections,
      totalVaultResources,
      totalChatMessages,
      recentWorkspaces: workspacesWithCounts,
    }),
  );
});

router.get("/dashboard/activity", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getClerkUserId(req);
  const dbUser = await getOrCreateDbUser(clerkUserId);
  if (!dbUser) {
    res.json([]);
    return;
  }

  const parsed = GetDashboardActivityQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 20) : 20;

  const events = await db
    .select({
      id: activityEventsTable.id,
      type: activityEventsTable.type,
      description: activityEventsTable.description,
      workspaceId: activityEventsTable.workspaceId,
      workspaceTitle: workspacesTable.title,
      createdAt: activityEventsTable.createdAt,
    })
    .from(activityEventsTable)
    .leftJoin(workspacesTable, eq(activityEventsTable.workspaceId, workspacesTable.id))
    .where(eq(activityEventsTable.userId, dbUser.id))
    .orderBy(sql`${activityEventsTable.createdAt} desc`)
    .limit(limit);

  res.json(
    GetDashboardActivityResponse.parse(
      events.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
        workspaceId: e.workspaceId ?? null,
        workspaceTitle: e.workspaceTitle ?? null,
      })),
    ),
  );
});

export default router;
