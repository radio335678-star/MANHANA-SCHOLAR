import type { workspacesTable } from "@workspace/db";

export function mapWorkspaceListRow(
  ws: typeof workspacesTable.$inferSelect & {
    totalSections?: number;
    completedSections?: number;
  },
) {
  const row = mapWorkspaceRow(ws);
  return {
    ...row,
    preThesisDraftMd: undefined,
    preThesisLockedMd: undefined,
    preThesisChecklist: undefined,
    researchNotes: undefined,
  };
}

export function mapWorkspaceRow(
  ws: typeof workspacesTable.$inferSelect & {
    totalSections?: number;
    completedSections?: number;
  },
) {
  return {
    id: ws.id,
    userId: ws.userId,
    title: ws.title,
    description: ws.description ?? null,
    domain: ws.domain,
    qualification: ws.qualification ?? null,
    guideName: ws.guideName ?? null,
    coGuideName: ws.coGuideName ?? null,
    collegeName: ws.collegeName ?? null,
    state: ws.state ?? null,
    universityName: ws.universityName ?? null,
    departmentId: ws.departmentId ?? null,
    candidateName: ws.candidateName ?? null,
    hodName: ws.hodName ?? null,
    studyType: ws.studyType ?? null,
    preThesisBuildVersion: ws.preThesisBuildVersion ?? 1,
    hasSynopsis: Boolean(ws.synopsisText?.trim()),
    status: ws.status,
    workflowState: ws.workflowState,
    preThesisDraftMd: ws.preThesisDraftMd ?? null,
    preThesisLockedMd: ws.preThesisLockedMd ?? null,
    preThesisMdHash: ws.preThesisMdHash ?? null,
    preThesisChecklist: ws.preThesisChecklist ?? undefined,
    researchNotes: ws.researchNotes ?? null,
    lastLiveVerifiedAt: ws.lastLiveVerifiedAt?.toISOString() ?? null,
    lockedAt: ws.lockedAt?.toISOString() ?? null,
    totalSections: ws.totalSections ?? 0,
    completedSections: ws.completedSections ?? 0,
    createdAt: ws.createdAt.toISOString(),
    updatedAt: ws.updatedAt.toISOString(),
  };
}
