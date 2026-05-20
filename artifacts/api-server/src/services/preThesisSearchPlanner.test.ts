import { describe, it, expect } from "vitest";
import { buildSearchQueryPlan } from "./preThesisSearchPlanner";

describe("preThesisSearchPlanner", () => {
  it("builds queries from workspace context", () => {
    const plan = buildSearchQueryPlan(
      {
        id: 1,
        userId: 1,
        title: "HRUS in DPN",
        domain: "Allopathy",
        qualification: "MD",
        universityName: "RGUHS",
        collegeName: "JSS Medical College",
        description: null,
        guideName: null,
        workflowState: "pre_setup",
        status: "active",
        departmentId: null,
        candidateName: null,
        hodName: null,
        synopsisText: null,
        synopsisStoragePath: null,
        studyType: null,
        preThesisBuildVersion: 1,
        preThesisDraftMd: null,
        preThesisLockedMd: null,
        preThesisMdHash: null,
        preThesisChecklist: null,
        researchNotes: null,
        lastLiveVerifiedAt: null,
        lockedAt: null,
        ownerUuid: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never,
      { id: 1, domain: "Allopathy", name: "Radiodiagnosis", slug: "radiodiagnosis", qualificationLevels: ["pg"], regulatoryBody: "NMC" },
    );

    expect(plan.queries.length).toBeGreaterThan(2);
    expect(plan.queries.some((q) => q.includes("RGUHS"))).toBe(true);
    expect(plan.queries.some((q) => q.includes("Radiodiagnosis"))).toBe(true);
    expect(plan.cacheKey).toContain("allopathy");
  });
});
