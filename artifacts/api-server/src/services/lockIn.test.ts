import { describe, it, expect } from "vitest";
import { getModelChain } from "../lib/kimiModelRouter";

describe("lock flow helpers", () => {
  it("model chain is non-empty for master chart generation fallback", () => {
    const chain = getModelChain();
    expect(chain.length).toBeGreaterThan(0);
    expect(typeof chain[0]).toBe("string");
  });
});
