import { db } from "@workspace/db";
import {
  workspacesTable,
  preThesisBuildJobsTable,
  preThesisSourcesTable,
  preThesisDocumentRevisionsTable,
  eq,
  desc,
} from "@workspace/db";
import {
  PreThesisDocumentV2Schema,
  type PreThesisDocumentV2,
} from "../types/preThesisDocumentV2";
import { compilePreThesisMdV2 } from "./preThesisCompilerV2";
import { computeCompletenessScore } from "./preThesisCompleteness";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function deepMergeDocument(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    const bv = result[key];
    if (isPlainObject(pv) && isPlainObject(bv)) {
      result[key] = deepMergeDocument(bv, pv);
    } else if (pv !== undefined) {
      result[key] = pv;
    }
  }
  return result;
}

export type ApplyPatchResult = {
  document: PreThesisDocumentV2;
  draftMd: string;
  completenessScore: number;
  revision: number;
  summary: string;
};

export async function getLatestBuildJob(workspaceId: number) {
  const [job] = await db
    .select()
    .from(preThesisBuildJobsTable)
    .where(eq(preThesisBuildJobsTable.workspaceId, workspaceId))
    .orderBy(desc(preThesisBuildJobsTable.createdAt))
    .limit(1);
  return job ?? null;
}

async function nextRevisionNumber(workspaceId: number): Promise<number> {
  const [row] = await db
    .select({ revision: preThesisDocumentRevisionsTable.revision })
    .from(preThesisDocumentRevisionsTable)
    .where(eq(preThesisDocumentRevisionsTable.workspaceId, workspaceId))
    .orderBy(desc(preThesisDocumentRevisionsTable.revision))
    .limit(1);
  return (row?.revision ?? 0) + 1;
}

export async function applyPreThesisPatch(
  workspaceId: number,
  userId: number,
  patch: Record<string, unknown>,
  summary: string,
  source: "ai" | "undo" = "ai",
): Promise<ApplyPatchResult> {
  const job = await getLatestBuildJob(workspaceId);
  if (!job?.resultJson) {
    throw new Error("No pre-thesis document to update. Run Build Pre-Thesis first.");
  }

  const merged = deepMergeDocument(job.resultJson as Record<string, unknown>, patch);
  const parsed = PreThesisDocumentV2Schema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(`Invalid document patch: ${parsed.error.message}`);
  }

  const doc = parsed.data;
  const draftMd = compilePreThesisMdV2(doc);
  const liveSourceCount = doc.sources.filter((s) => s.attribution === "live").length;
  const completenessScore = computeCompletenessScore(doc, liveSourceCount);

  await db
    .update(preThesisBuildJobsTable)
    .set({
      resultJson: doc as unknown as Record<string, unknown>,
      completenessScore,
      warnings: doc.warnings ?? [],
    })
    .where(eq(preThesisBuildJobsTable.id, job.id));

  await db
    .update(workspacesTable)
    .set({
      preThesisDraftMd: draftMd,
      preThesisBuildVersion: 2,
      updatedAt: new Date(),
    })
    .where(eq(workspacesTable.id, workspaceId));

  if (patch.sources && Array.isArray(patch.sources)) {
    for (const src of doc.sources) {
      if (src.attribution !== "live") continue;
      const existing = await db
        .select()
        .from(preThesisSourcesTable)
        .where(eq(preThesisSourcesTable.workspaceId, workspaceId))
        .limit(100);
      const dup = existing.find((e) => e.title === src.title && e.url === (src.url ?? null));
      if (!dup) {
        await db.insert(preThesisSourcesTable).values({
          workspaceId,
          buildJobId: job.id,
          attribution: "live",
          title: src.title,
          url: src.url ?? null,
          snippet: src.snippet ?? null,
          confidence: src.confidence ?? null,
          sourceType: src.sourceType ?? "ai_assistant",
        });
      }
    }
  }

  const revision = await nextRevisionNumber(workspaceId);
  await db.insert(preThesisDocumentRevisionsTable).values({
    workspaceId,
    revision,
    resultJson: doc as unknown as Record<string, unknown>,
    draftMd,
    completenessScore,
    createdByUserId: userId,
    source,
    summary,
  });

  return { document: doc, draftMd, completenessScore, revision, summary };
}

export async function undoLastAiRevision(
  workspaceId: number,
  userId: number,
): Promise<ApplyPatchResult | null> {
  const revisions = await db
    .select()
    .from(preThesisDocumentRevisionsTable)
    .where(eq(preThesisDocumentRevisionsTable.workspaceId, workspaceId))
    .orderBy(desc(preThesisDocumentRevisionsTable.revision))
    .limit(2);

  if (revisions.length < 2) {
    return null;
  }

  const previous = revisions[1]!;
  const parsed = PreThesisDocumentV2Schema.safeParse(previous.resultJson);
  if (!parsed.success) {
    throw new Error("Previous revision is invalid");
  }

  const job = await getLatestBuildJob(workspaceId);
  if (!job) throw new Error("No build job");

  const doc = parsed.data;
  const draftMd = previous.draftMd;
  const completenessScore =
    previous.completenessScore ??
    computeCompletenessScore(doc, doc.sources.filter((s) => s.attribution === "live").length);

  await db
    .update(preThesisBuildJobsTable)
    .set({
      resultJson: doc as unknown as Record<string, unknown>,
      completenessScore,
    })
    .where(eq(preThesisBuildJobsTable.id, job.id));

  await db
    .update(workspacesTable)
    .set({ preThesisDraftMd: draftMd, updatedAt: new Date() })
    .where(eq(workspacesTable.id, workspaceId));

  const revision = await nextRevisionNumber(workspaceId);
  await db.insert(preThesisDocumentRevisionsTable).values({
    workspaceId,
    revision,
    resultJson: doc as unknown as Record<string, unknown>,
    draftMd,
    completenessScore,
    createdByUserId: userId,
    source: "undo",
    summary: "Restored previous revision",
  });

  return {
    document: doc,
    draftMd,
    completenessScore,
    revision,
    summary: "Restored previous revision",
  };
}
