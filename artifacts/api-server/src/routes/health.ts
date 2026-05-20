import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { isStorageConfigured } from "../lib/supabaseStorage";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/** Readiness: DB + Supabase storage config (for deploy probes). */
router.get("/healthz/ready", async (_req, res) => {
  const checks: Record<string, boolean> = {
    database: false,
    supabaseStorage: isStorageConfigured(),
    supabaseAuth: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
  };

  try {
    await pool.query("SELECT 1");
    checks.database = true;
  } catch {
    checks.database = false;
  }

  const ready =
    checks.database && checks.supabaseStorage && checks.supabaseAuth;

  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    checks,
  });
});

export default router;
