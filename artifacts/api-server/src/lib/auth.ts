import type { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { db, usersTable, eq, type User } from "@workspace/db";

export type AuthPayload = {
  supabaseUserId: string;
  email: string;
};

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthPayload;
  }
}

function getSupabaseAuthClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const supabase = getSupabaseAuthClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    req.auth = {
      supabaseUserId: data.user.id,
      email: data.user.email ?? "",
    };
    next();
  } catch {
    res.status(503).json({ error: "Auth service unavailable" });
  }
}

export async function getDbUserByAuth(req: Request): Promise<User | null> {
  if (!req.auth) return null;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.supabaseUserId, req.auth.supabaseUserId))
    .limit(1);
  return user ?? null;
}

export async function requireDbUser(req: Request, res: Response): Promise<User | null> {
  if (!req.auth) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const user = await getDbUserByAuth(req);
  if (!user) {
    res.status(404).json({ error: "Profile not found. Complete onboarding." });
    return null;
  }
  return user;
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await requireDbUser(req, res);
  if (!user) return;
  if (user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
