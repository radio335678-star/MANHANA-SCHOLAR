import pLimit from "p-limit";
import { db } from "@workspace/db";
import {
  sectionsTable,
  workspacesTable,
  usersTable,
  activityEventsTable,
  eq,
  asc,
} from "@workspace/db";
import { MAX_THESIS_PAGES, totalTargetPages } from "../lib/standardSections";
import { getWorkspaceAiContext } from "../lib/workspaceContext";
import { runThesisSectionAgent, type ThesisSectionAgentEvent } from "./thesisSectionAgent";
import { runCoherenceCheck } from "./sectionCoherence";
import { scaffoldStandardSections } from "./sectionScaffold";

export type AutoCompleteEvent =
  | { type: "started"; totalSections: number; totalPages: number }
  | { type: "section_start"; sectionId: number; sectionTitle: string; index: number; total: number }
  | ThesisSectionAgentEvent
  | { type: "section_done"; sectionId: number; sectionTitle: string }
  | { type: "coherence"; score: number; issueCount: number }
  | { type: "complete"; sectionsCompleted: number }
  | { type: "cancelled" }
  | { type: "error"; message: string };

const cancelFlags = new Map<number, boolean>();
const AUTO_COMPLETE_CONCURRENCY = 4;

export function requestAutoCompleteCancel(workspaceId: number): void {
  cancelFlags.set(workspaceId, true);
}

export function clearAutoCompleteCancel(workspaceId: number): void {
  cancelFlags.delete(workspaceId);
}

function isCancelled(workspaceId: number): boolean {
  return cancelFlags.get(workspaceId) === true;
}

export async function validateAutoCompletePrerequisites(workspaceId: number): Promise<{
  ok: boolean;
  warnings: string[];
  errors: string[];
}> {
  const warnings: string[] = [];
  const errors: string[] = [];

  const [ws] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);

  if (!ws) {
    errors.push("Workspace not found");
    return { ok: false, warnings, errors };
  }

  if (!ws.preThesisLockedMd?.trim() || !ws.preThesisMdHash) {
    errors.push("Pre-thesis file must be locked before auto-complete");
  }

  let sections = await db
    .select()
    .from(sectionsTable)
    .where(eq(sectionsTable.workspaceId, workspaceId))
    .orderBy(asc(sectionsTable.order));

  if (sections.length === 0) {
    warnings.push("No sections found — standard sections will be scaffolded with default page targets");
    sections = await scaffoldStandardSections(workspaceId);
  }

  const missingTargets = sections.filter((s) => s.targetPages == null);
  if (missingTargets.length > 0) {
    warnings.push(
      `${missingTargets.length} section(s) have no custom page target — standard ranges will be used`,
    );
  }

  const pages = totalTargetPages(sections);
  if (pages > MAX_THESIS_PAGES) {
    errors.push(`Total page target (${pages}) exceeds maximum of ${MAX_THESIS_PAGES} pages`);
  }

  return { ok: errors.length === 0, warnings, errors };
}

export async function runThesisAutoComplete(params: {
  workspaceId: number;
  userId: number;
  onEvent: (event: AutoCompleteEvent) => void;
}): Promise<void> {
  clearAutoCompleteCancel(params.workspaceId);

  const validation = await validateAutoCompletePrerequisites(params.workspaceId);
  if (!validation.ok) {
    params.onEvent({ type: "error", message: validation.errors.join("; ") });
    return;
  }

  const aiCtx = await getWorkspaceAiContext(params.workspaceId);

  const [ws] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, params.workspaceId))
    .limit(1);

  const [userProfile] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.userId))
    .limit(1);

  if (!ws) {
    params.onEvent({ type: "error", message: "Workspace not found" });
    return;
  }

  let sections = await db
    .select()
    .from(sectionsTable)
    .where(eq(sectionsTable.workspaceId, params.workspaceId))
    .orderBy(asc(sectionsTable.order));

  if (sections.length === 0) {
    sections = await scaffoldStandardSections(params.workspaceId);
  }

  await db
    .update(workspacesTable)
    .set({ autoCompleteStatus: "running", updatedAt: new Date() })
    .where(eq(workspacesTable.id, params.workspaceId));

  const totalPages = totalTargetPages(sections);
  params.onEvent({ type: "started", totalSections: sections.length, totalPages });

  let completed = 0;

  const skipResearchTitles = new Set([
    "Title Page",
    "Certificate",
    "Declaration",
    "Acknowledgements",
    "List of Abbreviations",
    "Tables",
    "Annexures",
  ]);

  try {
    const limit = pLimit(AUTO_COMPLETE_CONCURRENCY);

    const sectionTasks = sections.map((section, i) =>
      limit(async () => {
        if (isCancelled(params.workspaceId)) {
          return { cancelled: true as const, sectionId: section.id };
        }

        await db
          .update(workspacesTable)
          .set({ autoCompleteCurrentSection: section.id, updatedAt: new Date() })
          .where(eq(workspacesTable.id, params.workspaceId));

        params.onEvent({
          type: "section_start",
          sectionId: section.id,
          sectionTitle: section.title,
          index: i + 1,
          total: sections.length,
        });

        await runThesisSectionAgent({
          workspaceId: params.workspaceId,
          sectionId: section.id,
          mode: "generate",
          aiCtx,
          workspace: ws,
          section,
          userProfile,
          skipResearch: skipResearchTitles.has(section.title),
          onEvent: params.onEvent,
        });

        await db
          .update(sectionsTable)
          .set({ status: "completed", updatedAt: new Date() })
          .where(eq(sectionsTable.id, section.id));

        params.onEvent({ type: "section_done", sectionId: section.id, sectionTitle: section.title });
        return { cancelled: false as const, sectionId: section.id };
      }),
    );

    const results = await Promise.allSettled(sectionTasks);

    if (isCancelled(params.workspaceId)) {
      await db
        .update(workspacesTable)
        .set({ autoCompleteStatus: "cancelled", autoCompleteCurrentSection: null, updatedAt: new Date() })
        .where(eq(workspacesTable.id, params.workspaceId));
      params.onEvent({ type: "cancelled" });
      return;
    }

    const rejected = results.find((r) => r.status === "rejected");
    if (rejected && rejected.status === "rejected") {
      throw rejected.reason;
    }

    completed = results.filter((r) => r.status === "fulfilled").length;

    const coherence = await runCoherenceCheck(params.workspaceId, aiCtx.vaultCatalog);
    params.onEvent({
      type: "coherence",
      score: coherence.score,
      issueCount: coherence.issues.length,
    });

    await db
      .update(workspacesTable)
      .set({
        autoCompleteStatus: "completed",
        autoCompleteCurrentSection: null,
        workflowState: "review",
        updatedAt: new Date(),
      })
      .where(eq(workspacesTable.id, params.workspaceId));

    await db.insert(activityEventsTable).values({
      userId: params.userId,
      workspaceId: params.workspaceId,
      type: "thesis_auto_complete",
      description: `Auto-completed ${completed} thesis sections`,
    });

    params.onEvent({ type: "complete", sectionsCompleted: completed });
  } catch (err) {
    await db
      .update(workspacesTable)
      .set({ autoCompleteStatus: "failed", autoCompleteCurrentSection: null, updatedAt: new Date() })
      .where(eq(workspacesTable.id, params.workspaceId));
    params.onEvent({
      type: "error",
      message: err instanceof Error ? err.message : "Auto-complete failed",
    });
  } finally {
    clearAutoCompleteCancel(params.workspaceId);
  }
}
