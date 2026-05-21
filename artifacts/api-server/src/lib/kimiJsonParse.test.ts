import { describe, expect, it } from "vitest";
import { parseModelJson } from "./kimiJsonParse";

describe("parseModelJson", () => {
  it("returns null for empty content without throwing", () => {
    expect(parseModelJson({ role: "assistant", content: "" })).toBeNull();
  });

  it("parses fenced JSON", () => {
    const msg = {
      role: "assistant" as const,
      content: '```json\n{"paper":"A4"}\n```',
    };
    expect(parseModelJson<{ paper: string }>(msg)).toEqual({ paper: "A4" });
  });

  it("extracts JSON object from surrounding text", () => {
    const msg = {
      role: "assistant" as const,
      content: 'Here is the result:\n{"font":"Arial"}\nDone.',
    };
    expect(parseModelJson<{ font: string }>(msg)).toEqual({ font: "Arial" });
  });
});
