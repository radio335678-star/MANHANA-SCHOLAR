import { Router, type IRouter } from "express";
import { db, usersTable, eq } from "@workspace/db";
import { requireAuth, requireDbUser } from "../lib/auth";
import {
  GetProfileResponse,
  UpsertProfileBody,
  UpsertProfileResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/profile", requireAuth, async (req, res): Promise<void> => {
  const user = await requireDbUser(req, res);
  if (!user) return;

  res.json(GetProfileResponse.parse({ ...user, createdAt: user.createdAt.toISOString() }));
});

router.put("/profile", requireAuth, async (req, res): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = UpsertProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.supabaseUserId, req.auth.supabaseUserId))
    .limit(1);

  let user;
  if (existing) {
    [user] = await db
      .update(usersTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(usersTable.supabaseUserId, req.auth.supabaseUserId))
      .returning();
  } else {
    [user] = await db
      .insert(usersTable)
      .values({
        ...data,
        supabaseUserId: req.auth.supabaseUserId,
        email: data.email ?? req.auth.email,
      })
      .returning();
  }

  res.json(UpsertProfileResponse.parse({ ...user!, createdAt: user!.createdAt.toISOString() }));
});

export default router;
