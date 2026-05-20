import { describe, it, expect } from "vitest";
import { extractDatasetContextText } from "./contextExtract";

describe("extractDatasetContextText", () => {
  it("returns OCR placeholder for images", async () => {
    const text = await extractDatasetContextText(
      Buffer.from("fake"),
      "image/png",
      "scan.png",
    );
    expect(text).toContain("scan.png");
    expect(text).toContain("KIMI_API_KEY");
  });

  it("extracts plain text files", async () => {
    const text = await extractDatasetContextText(
      Buffer.from("age,sex,group\n45,M,A"),
      "text/plain",
      "data.csv",
    );
    expect(text).toContain("45,M,A");
  });
});
