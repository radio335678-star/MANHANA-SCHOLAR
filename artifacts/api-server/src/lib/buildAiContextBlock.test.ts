import { describe, expect, it } from "vitest";
import { buildAiContextBlock } from "./buildAiContextBlock";

describe("buildAiContextBlock", () => {
  it("includes locked MD and research notes in prompt block", () => {
    const block = buildAiContextBlock("# Title\n\nSample n=80", "Ethics IEC/2024/001");
    expect(block).toContain("LOCKED PRE-THESIS SETUP");
    expect(block).toContain("Sample n=80");
    expect(block).toContain("Ethics IEC/2024/001");
  });
});
