import { createHash } from "node:crypto";

export function canonicalizeMd(md: string): string {
  return md.replace(/\r\n/g, "\n").trim();
}

export function sha256PreThesisMd(md: string): string {
  return createHash("sha256").update(canonicalizeMd(md), "utf8").digest("hex");
}
