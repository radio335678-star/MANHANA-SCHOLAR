/**
 * Supabase integration smoke test. Run: pnpm supabase:smoke
 * Never prints secret values.
 */
import { createClient } from "@supabase/supabase-js";
import { loadWorkspaceEnv } from "../loadEnv";

loadWorkspaceEnv();

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_STORAGE_BUCKET,
} = process.env;

let failed = false;

async function testDatabase(): Promise<void> {
  const { pool } = await import("@workspace/db");
  try {
    const domains = await pool.query("SELECT COUNT(*)::int AS n FROM domains");
    const quals = await pool.query("SELECT COUNT(*)::int AS n FROM qualifications");
    const depts = await pool.query("SELECT COUNT(*)::int AS n FROM departments");
    const trigger = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
       ) AS ok`,
    );
    console.log(
      `  ✓ Postgres — connected (${domains.rows[0].n} domains, ${quals.rows[0].n} qualifications, ${depts.rows[0].n} PG departments)`,
    );
    if (!trigger.rows[0].ok) {
      console.log("  ✗ Auth trigger on_auth_user_created missing");
      failed = true;
    } else {
      console.log("  ✓ Auth trigger on_auth_user_created present");
    }
  } catch (err) {
    const e = err as Error & { code?: string; cause?: unknown };
    const parts = [e.message, e.code, e.cause ? String(e.cause) : ""].filter(Boolean);
    console.log(`  ✗ Postgres — ${parts.join(" | ") || "connection failed"}`);
    failed = true;
  } finally {
    await pool.end();
  }
}

async function testStorage(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log("  ✗ Storage — missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    failed = true;
    return;
  }
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = SUPABASE_STORAGE_BUCKET ?? "thesis-artifacts";
  const { error } = await client.storage.from(bucket).list("", { limit: 1 });
  if (error) {
    console.log(`  ✗ Storage bucket "${bucket}" — ${error.message}`);
    failed = true;
    return;
  }
  console.log(`  ✓ Storage bucket "${bucket}" — reachable`);
}

async function testAuthApi(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.log("  ✗ Auth API — missing SUPABASE_URL or SUPABASE_ANON_KEY");
    failed = true;
    return;
  }
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.getSession();
  if (error) {
    console.log(`  ✗ Auth API — ${error.message}`);
    failed = true;
  } else {
    console.log("  ✓ Auth API — reachable");
  }
}

console.log("Supabase smoke test\n");
await testDatabase();
await testStorage();
await testAuthApi();

if (failed) {
  console.log("\nSmoke test failed.");
  process.exit(1);
}
console.log("\nAll Supabase integration checks passed.");
