import { db } from "@workspace/db";
import { workspacesTable, preThesisBuildJobsTable, eq, desc } from "@workspace/db";
import { exportPreThesisDocx } from "./preThesisDocxExport";
import { PreThesisDocumentV2Schema } from "../types/preThesisDocumentV2";
import { PreThesisExportError } from "./preThesisExportError";

export async function buildPreThesisDocxBuffer(workspaceId: number): Promise<Buffer> {
  const [ws] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);

  if (!ws) {
    throw new PreThesisExportError("Workspace not found", "NOT_FOUND");
  }

  const [lastJob] = await db
    .select()
    .from(preThesisBuildJobsTable)
    .where(eq(preThesisBuildJobsTable.workspaceId, workspaceId))
    .orderBy(desc(preThesisBuildJobsTable.createdAt))
    .limit(1);

  if (lastJob?.status === "running" || lastJob?.status === "queued") {
    throw new PreThesisExportError(
      "Pre-thesis build is still in progress. Wait for it to finish, then export again.",
      "BUILD_IN_PROGRESS",
    );
  }

  const md = (ws.preThesisLockedMd ?? ws.preThesisDraftMd)?.trim();

  if (lastJob?.status === "failed" && !md) {
    throw new PreThesisExportError(
      lastJob.error ?? "Pre-thesis build failed. Run Build Pre-Thesis again.",
      "BUILD_FAILED",
    );
  }

  if (lastJob?.status === "completed" && lastJob.resultJson) {
    const parsed = PreThesisDocumentV2Schema.safeParse(lastJob.resultJson);
    if (parsed.success) {
      try {
        return await exportPreThesisDocx(parsed.data);
      } catch (err) {
        throw new PreThesisExportError(
          err instanceof Error ? err.message : "DOCX export failed",
          "EXPORT_FAILED",
        );
      }
    }
  }

  if (!md) {
    throw new PreThesisExportError(
      "No pre-thesis document to export. Run Build Pre-Thesis first.",
      "NOT_FOUND",
    );
  }

  try {
    const { exportPreThesisDocxFromMd } = await import("./preThesisDocxExport");
    return exportPreThesisDocxFromMd(md, ws.title);
  } catch (err) {
    throw new PreThesisExportError(
      err instanceof Error ? err.message : "DOCX export failed",
      "EXPORT_FAILED",
    );
  }
}
