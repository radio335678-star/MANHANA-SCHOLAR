import { describe, expect, it } from "vitest";
import { canonicalizeMd, sha256PreThesisMd } from "./preThesisHash";

describe("preThesisHash", () => {
  it("normalizes line endings before hashing", () => {
    const a = sha256PreThesisMd("line1\r\nline2\r\n");
    const b = sha256PreThesisMd("line1\nline2");
    expect(a).toBe(b);
  });

  it("trims surrounding whitespace", () => {
    expect(sha256PreThesisMd("  hello  ")).toBe(sha256PreThesisMd("hello"));
  });

  it("canonicalizeMd is stable", () => {
    expect(canonicalizeMd("a\r\nb")).toBe("a\nb");
  });
});
