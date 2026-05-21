import { db } from "@workspace/db";
import { preThesisBuildJobsTable, eq, or } from "@workspace/db";
import { logger } from "../lib/logger";

/**
 * Mark in-flight build jobs as failed after a process restart (e.g. Render SIGTERM during deploy).
 * Builds only run in-process via setImmediate; they cannot survive a new container.
 */
export async function recoverStalePreThesisBuildJobs(): Promise<number> {
  const rows = await db
    .update(preThesisBuildJobsTable)
    .set({
      status: "failed",
      error: "Build interrupted (server restarted). Run Build Pre-Thesis again.",
      completedAt: new Date(),
      currentAgent: null,
    })
    .where(or(eq(preThesisBuildJobsTable.status, "running"), eq(preThesisBuildJobsTable.status, "queued")))
    .returning({ id: preThesisBuildJobsTable.id });

  if (rows.length > 0) {
    logger.warn({ count: rows.length, jobIds: rows.map((r) => r.id) }, "Recovered stale pre-thesis build jobs");
  }
  return rows.length;
}
