import { describe, expect, it } from "vitest";
import { WORKFLOW_TRANSITIONS, isAtLeastLocked, isWorkflowState } from "./workflow";

describe("workflow state machine", () => {
  it("defines init -> pre_setup only", () => {
    expect(WORKFLOW_TRANSITIONS.init).toEqual(["pre_setup"]);
  });

  it("allows unlock path from locked_in to pre_setup", () => {
    expect(WORKFLOW_TRANSITIONS.locked_in).toContain("pre_setup");
  });

  it("isAtLeastLocked gates AI after lock-in", () => {
    expect(isAtLeastLocked("pre_setup")).toBe(false);
    expect(isAtLeastLocked("locked_in")).toBe(true);
    expect(isAtLeastLocked("section_build")).toBe(true);
  });

  it("validates workflow state strings", () => {
    expect(isWorkflowState("locked_in")).toBe(true);
    expect(isWorkflowState("bogus")).toBe(false);
  });
});
