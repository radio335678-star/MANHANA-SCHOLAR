import { db } from "@workspace/db";
import {
  workspacesTable,
  workspaceStateTransitionsTable,
  sectionsTable,
} from "@workspace/db";
import { eq, count } from "@workspace/db";
import {
  WORKFLOW_TRANSITIONS,
  type WorkflowState,
  isWorkflowState,
} from "../types/workflow";

export class WorkflowTransitionError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_TRANSITION" | "GUARD_FAILED",
    public readonly from: WorkflowState,
    public readonly to: WorkflowState,
  ) {
    super(message);
    this.name = "WorkflowTransitionError";
  }
}

export async function getAllowedTransitions(
  workspaceId: number,
): Promise<WorkflowState[]> {
  const [ws] = await db
    .select({ workflowState: workspacesTable.workflowState })
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);
  if (!ws?.workflowState || !isWorkflowState(ws.workflowState)) return ["pre_setup"];
  const current = ws.workflowState;
  const allowed = [...WORKFLOW_TRANSITIONS[current]];
  if (current === "locked_in") {
    const [{ total }] = await db
      .select({ total: count() })
      .from(sectionsTable)
      .where(eq(sectionsTable.workspaceId, workspaceId));
    if (Number(total) === 0) {
      return allowed.filter((s) => s !== "section_build" || true);
    }
  }
  return allowed;
}

async function assertTransitionGuard(
  workspaceId: number,
  from: WorkflowState,
  to: WorkflowState,
  options?: { unlockConfirmed?: boolean },
): Promise<void> {
  if (from === "pre_setup" && to === "locked_in") {
    const [ws] = await db
      .select({
        draft: workspacesTable.preThesisDraftMd,
      })
      .from(workspacesTable)
      .where(eq(workspacesTable.id, workspaceId))
      .limit(1);
    if (!ws?.draft?.trim()) {
      throw new WorkflowTransitionError(
        "Pre-thesis draft must exist before lock-in",
        "GUARD_FAILED",
        from,
        to,
      );
    }
    return;
  }

  if (from === "locked_in" && to === "pre_setup") {
    if (!options?.unlockConfirmed) {
      throw new WorkflowTransitionError(
        "Unlock requires explicit confirmation",
        "GUARD_FAILED",
        from,
        to,
      );
    }
    return;
  }

  if (from === "locked_in" && to === "section_build") {
    return;
  }

  if (from === "section_build" && to === "review") {
    return;
  }
}

export async function transitionWorkflow(
  workspaceId: number,
  actorUserId: number,
  targetState: WorkflowState,
  options?: { reason?: string; unlockConfirmed?: boolean; metadata?: Record<string, unknown> },
): Promise<WorkflowState> {
  const [ws] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);

  if (!ws) throw new Error("Workspace not found");
  const from = (isWorkflowState(ws.workflowState) ? ws.workflowState : "init") as WorkflowState;

  const allowed = WORKFLOW_TRANSITIONS[from];
  if (!allowed.includes(targetState)) {
    throw new WorkflowTransitionError(
      `Cannot transition from ${from} to ${targetState}`,
      "INVALID_TRANSITION",
      from,
      targetState,
    );
  }

  if (from === "locked_in" && targetState === "pre_setup" && !options?.unlockConfirmed) {
    throw new WorkflowTransitionError(
      "Unlock requires confirm: true",
      "GUARD_FAILED",
      from,
      targetState,
    );
  }

  await assertTransitionGuard(workspaceId, from, targetState, options);

  await db
    .update(workspacesTable)
    .set({
      workflowState: targetState,
      updatedAt: new Date(),
      ...(targetState === "archived" ? { status: "archived" as const } : {}),
      ...(targetState === "complete" ? { status: "completed" as const } : {}),
    })
    .where(eq(workspacesTable.id, workspaceId));

  await db.insert(workspaceStateTransitionsTable).values({
    workspaceId,
    fromState: from,
    toState: targetState,
    actorUserId,
    reason: options?.reason ?? null,
    metadata: options?.metadata ?? null,
  });

  return targetState;
}

export async function autoAdvanceOnFirstSection(workspaceId: number, actorUserId: number) {
  const [ws] = await db
    .select({ workflowState: workspacesTable.workflowState })
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);
  if (ws?.workflowState === "locked_in") {
    await transitionWorkflow(workspaceId, actorUserId, "section_build", {
      reason: "First section created",
    });
  }
}

export async function autoAdvanceOnAllSectionsComplete(
  workspaceId: number,
  actorUserId: number,
) {
  const [ws] = await db
    .select({ workflowState: workspacesTable.workflowState })
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);
  if (ws?.workflowState !== "section_build") return;

  const sections = await db
    .select({ status: sectionsTable.status })
    .from(sectionsTable)
    .where(eq(sectionsTable.workspaceId, workspaceId));

  if (sections.length > 0 && sections.every((s) => s.status === "completed")) {
    await transitionWorkflow(workspaceId, actorUserId, "review", {
      reason: "All sections completed",
    });
  }
}
