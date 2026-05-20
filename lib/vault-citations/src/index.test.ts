import { describe, expect, it } from "vitest";
import {
  buildCitationCatalog,
  buildVaultContextBlock,
  expandVaultCitationsInText,
  extractCitedVaultKeys,
  formatAuthorYear,
} from "./index";

describe("vault-citations", () => {
  it("builds catalog with stable V keys", () => {
    const catalog = buildCitationCatalog([
      {
        id: 10,
        type: "paper",
        title: "Guggulu in Gridhrasi",
        authors: "Sharma, R., Patel, K.",
        year: 2023,
        journal: "J Ayurveda",
      },
    ]);
    expect(catalog.V1?.resourceId).toBe(10);
    expect(catalog.V1?.authorYear).toContain("2023");
  });

  it("expands [V1] to author-year", () => {
    const catalog = buildCitationCatalog([
      {
        id: 1,
        type: "paper",
        title: "Test",
        authors: "Sharma, R.",
        year: 2022,
      },
    ]);
    const out = expandVaultCitationsInText("Finding was significant [V1].", catalog);
    expect(out).toContain("2022");
    expect(out).not.toContain("[V1]");
  });

  it("extracts cited keys", () => {
    expect(extractCitedVaultKeys("Text [V2] and [V1].")).toEqual(["V1", "V2"]);
  });

  it("formatAuthorYear handles et al.", () => {
    expect(formatAuthorYear("Sharma, R., Patel, K.", 2024)).toMatch(/et al\./);
  });

  it("empty vault warns against invented citations", () => {
    const { block } = buildVaultContextBlock([]);
    expect(block).toContain("Do not invent");
  });
});
