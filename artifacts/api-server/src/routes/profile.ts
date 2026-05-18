import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, getClerkUserId } from "../lib/auth";
import {
  GetProfileResponse,
  UpsertProfileBody,
  UpsertProfileResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/profile", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getClerkUserId(req);
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(GetProfileResponse.parse({ ...user, createdAt: user.createdAt.toISOString() }));
});

router.put("/profile", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getClerkUserId(req);
  const parsed = UpsertProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);

  let user;
  if (existing) {
    [user] = await db
      .update(usersTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .returning();
  } else {
    [user] = await db
      .insert(usersTable)
      .values({ ...data, clerkUserId })
      .returning();
  }

  res.json(UpsertProfileResponse.parse({ ...user, createdAt: user!.createdAt.toISOString() }));
});

export default router;
