export const WORKFLOW_STATES = [
  "init",
  "pre_setup",
  "locked_in",
  "section_build",
  "review",
  "complete",
  "archived",
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const WORKFLOW_TRANSITIONS: Record<
  WorkflowState,
  readonly WorkflowState[]
> = {
  init: ["pre_setup"],
  pre_setup: ["locked_in"],
  locked_in: ["section_build", "pre_setup"], // pre_setup via unlock only
  section_build: ["review"],
  review: ["complete", "section_build"],
  complete: ["archived", "review"],
  archived: [],
};

export function isWorkflowState(s: string): s is WorkflowState {
  return (WORKFLOW_STATES as readonly string[]).includes(s);
}

export function workflowRank(state: WorkflowState): number {
  const order: WorkflowState[] = [
    "init",
    "pre_setup",
    "locked_in",
    "section_build",
    "review",
    "complete",
    "archived",
  ];
  return order.indexOf(state);
}

export function isAtLeastLocked(state: WorkflowState): boolean {
  return workflowRank(state) >= workflowRank("locked_in");
}
