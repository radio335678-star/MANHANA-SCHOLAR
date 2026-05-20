const MAX_LOCKED_MD_CHARS = 24000;

export function buildAiContextBlock(lockedMd: string, researchNotes?: string | null): string {
  let md = lockedMd.trim();
  if (md.length > MAX_LOCKED_MD_CHARS) {
    md = md.slice(0, MAX_LOCKED_MD_CHARS) + "\n\n[… truncated for context window …]";
  }
  const notes = researchNotes?.trim()
    ? `\n\nAdditional locked research notes:\n${researchNotes}`
    : "";
  return `
SINGLE SOURCE OF TRUTH — LOCKED PRE-THESIS SETUP (do not contradict):
${md}${notes}
`.trim();
}
