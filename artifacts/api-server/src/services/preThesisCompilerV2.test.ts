import { describe, it, expect } from "vitest";
import { compilePreThesisMdV2, DEFAULT_KEY_RULES } from "./preThesisCompilerV2";
import type { PreThesisDocumentV2 } from "../types/preThesisDocumentV2";

const minimalDoc: PreThesisDocumentV2 = {
  buildVersion: 2,
  header: {
    degreeTitle: "MD Radiodiagnosis THESIS",
    universityOrdinances: "RGUHS / NMC",
    workspaceTitle: "HRUS in DPN",
    domain: "Allopathy",
    generatedAt: new Date().toISOString(),
    lastLiveVerifiedAt: new Date().toISOString(),
  },
  partA: {
    paginationNote: "Roman numerals",
    preliminaryPages: [{ page: "i", title: "Title Page", content: "Full title" }],
  },
  partB: {
    paginationNote: "Arabic numerals",
    pageLimitNote: "Min 50, Max 150",
    chapters: [{ chapter: "I", title: "INTRODUCTION", minPages: 8, maxPages: 12 }],
  },
  partC: {
    paginationNote: "Continues",
    supplementary: [{ id: "I", title: "References", content: "Vancouver" }],
  },
  formattingSpecs: {
    sourceNote: "University guidelines",
    rows: [{ element: "Font", specification: "Arial 11pt" }],
  },
  chapterBlueprints: [
    { chapter: "I", title: "INTRODUCTION", bullets: ["Disease burden", "Research gap"] },
  ],
  keyRules: DEFAULT_KEY_RULES,
  referencesGuide: { intro: "Vancouver", examples: ["Journal example"] },
  annexureTemplates: [],
  lockedResearchContext: "Study on DPN",
  rulesJson: {},
  sources: [],
  warnings: [],
};

describe("preThesisCompilerV2", () => {
  it("includes all major sections from example structure", () => {
    const md = compilePreThesisMdV2(minimalDoc);
    expect(md).toContain("PRE-REFERENCE STRUCTURE FILE");
    expect(md).toContain("PART A — PRELIMINARY PAGES");
    expect(md).toContain("PART B — MAIN BODY");
    expect(md).toContain("PART C — SUPPLEMENTARY");
    expect(md).toContain("WORD FORMATTING SPECIFICATIONS");
    expect(md).toContain("CHAPTER-BY-CHAPTER CONTENT BLUEPRINT");
    expect(md).toContain("KEY RULES TO REMEMBER");
    expect(md).toContain("REFERENCES — FORMAT GUIDE");
    expect(md).toContain("INTRODUCTION");
    expect(md).toContain("Disease burden");
  });
});
