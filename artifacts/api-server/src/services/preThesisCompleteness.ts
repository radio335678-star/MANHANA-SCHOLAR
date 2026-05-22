import type { PreThesisDocumentV2 } from "../types/preThesisDocumentV2";

export function computeCompletenessScore(doc: PreThesisDocumentV2, sourceCount: number): number {
  let score = 0;
  if (doc.partA.preliminaryPages.length >= 5) score += 15;
  if (doc.partB.chapters.length >= 5) score += 20;
  if (doc.chapterBlueprints.length >= 5) score += 25;
  if (doc.formattingSpecs.rows.length >= 8) score += 15;
  if (doc.partC.supplementary.length >= 3) score += 10;
  if (sourceCount >= 2) score += 10;
  if ((doc.literatureReferences?.length ?? 0) >= 8) score += 5;
  return Math.min(100, score);
}
