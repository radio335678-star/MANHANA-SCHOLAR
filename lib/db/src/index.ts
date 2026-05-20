/**
 * Supabase Postgres data access layer (@workspace/db).
 * Apply schema changes via supabase/migrations/, not this package.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set (Supabase connection pooler URL).",
  );
}

const databaseUrl = process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl?.includes("supabase.com")
    ? { rejectUnauthorized: false }
    : undefined,
  max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
});

/** Supavisor transaction pooler (port 6543) does not support prepared statements. */
export const db = drizzle(pool, { schema, prepare: false });

export * from "./schema";
export {
  INDIAN_STATES_AND_UTS,
  INDIAN_STATE_SET,
  isIndianStateOrUt,
  type IndianStateOrUt,
} from "./constants/indian-states";
export { eq, and, or, desc, asc, sql, count, ilike, gte, ne } from "drizzle-orm";
