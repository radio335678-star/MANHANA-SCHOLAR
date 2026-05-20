import { db } from "@workspace/db";
import {
  workspacesTable,
  preThesisBuildJobsTable,
  eq,
  and,
  desc,
} from "@workspace/db";
import { exportPreThesisDocx } from "./preThesisDocxExport";
import { PreThesisDocumentV2Schema } from "../types/preThesisDocumentV2";

export async function buildPreThesisDocxBuffer(workspaceId: number): Promise<Buffer> {
  const [ws] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);

  if (!ws) throw new Error("Workspace not found");

  const md = ws.preThesisLockedMd ?? ws.preThesisDraftMd;
  if (!md) throw new Error("No pre-thesis document to export");

  const [lastJob] = await db
    .select()
    .from(preThesisBuildJobsTable)
    .where(
      and(
        eq(preThesisBuildJobsTable.workspaceId, workspaceId),
        eq(preThesisBuildJobsTable.status, "completed"),
      ),
    )
    .orderBy(desc(preThesisBuildJobsTable.completedAt))
    .limit(1);

  if (lastJob?.resultJson) {
    const parsed = PreThesisDocumentV2Schema.safeParse(lastJob.resultJson);
    if (parsed.success) {
      return exportPreThesisDocx(parsed.data);
    }
  }

  const { exportPreThesisDocxFromMd } = await import("./preThesisDocxExport");
  return exportPreThesisDocxFromMd(md, ws.title);
}
