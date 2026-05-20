import { describe, it, expect, afterEach } from "vitest";
import {
  getModelChain,
  KIMI_FRONTIER_FALLBACK,
  KIMI_FRONTIER_PRIMARY,
} from "./kimiModelRouter";

describe("kimiModelRouter", () => {
  const originalPrimary = process.env.KIMI_PRIMARY_MODEL;
  const originalFallback = process.env.KIMI_FALLBACK_MODELS;
  const originalModel = process.env.KIMI_MODEL;

  afterEach(() => {
    if (originalPrimary === undefined) delete process.env.KIMI_PRIMARY_MODEL;
    else process.env.KIMI_PRIMARY_MODEL = originalPrimary;
    if (originalFallback === undefined) delete process.env.KIMI_FALLBACK_MODELS;
    else process.env.KIMI_FALLBACK_MODELS = originalFallback;
    if (originalModel === undefined) delete process.env.KIMI_MODEL;
    else process.env.KIMI_MODEL = originalModel;
  });

  it("deduplicates primary and fallback models", () => {
    process.env.KIMI_PRIMARY_MODEL = "model-a";
    process.env.KIMI_FALLBACK_MODELS = "model-a,model-b";
    const chain = getModelChain();
    expect(chain).toEqual(["model-a", "model-b"]);
  });

  it("defaults to frontier thinking models only", () => {
    delete process.env.KIMI_PRIMARY_MODEL;
    delete process.env.KIMI_FALLBACK_MODELS;
    delete process.env.KIMI_MODEL;
    const chain = getModelChain();
    expect(chain).toEqual([KIMI_FRONTIER_PRIMARY, KIMI_FRONTIER_FALLBACK]);
  });
});
