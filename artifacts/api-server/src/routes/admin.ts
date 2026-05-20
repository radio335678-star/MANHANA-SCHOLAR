import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  workspacesTable,
  sectionsTable,
  chatMessagesTable,
  vaultResourcesTable,
  activityEventsTable,
  sql,
  desc,
  gte,
} from "@workspace/db";
import { requireAuth, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

router.get("/admin/stats", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalUsers] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);
  const [newUsersThisWeek] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(gte(usersTable.createdAt, sevenDaysAgo));
  const [totalWorkspaces] = await db.select({ count: sql<number>`count(*)::int` }).from(workspacesTable);
  const [activeWorkspaces] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workspacesTable)
    .where(sql`${workspacesTable.status} = 'active'`);
  const [totalSections] = await db.select({ count: sql<number>`count(*)::int` }).from(sectionsTable);
  const [totalMessages] = await db.select({ count: sql<number>`count(*)::int` }).from(chatMessagesTable);
  const [totalTokens] = await db
    .select({ sum: sql<number>`coalesce(sum(tokens_used), 0)::int` })
    .from(chatMessagesTable);
  const [totalVaultResources] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vaultResourcesTable);

  const recentEvents = await db
    .select()
    .from(activityEventsTable)
    .orderBy(desc(activityEventsTable.createdAt))
    .limit(20);

  const recentUsers = await db
    .select()
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt))
    .limit(10);

  res.json({
    users: {
      total: totalUsers?.count ?? 0,
      newThisWeek: newUsersThisWeek?.count ?? 0,
    },
    workspaces: {
      total: totalWorkspaces?.count ?? 0,
      active: activeWorkspaces?.count ?? 0,
    },
    sections: { total: totalSections?.count ?? 0 },
    ai: {
      totalMessages: totalMessages?.count ?? 0,
      totalTokensUsed: totalTokens?.sum ?? 0,
    },
    vault: { totalResources: totalVaultResources?.count ?? 0 },
    recentEvents: recentEvents.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })),
    recentUsers: recentUsers.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      domain: u.domain,
      qualification: u.qualification,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
    })),
  });
});

export default router;
