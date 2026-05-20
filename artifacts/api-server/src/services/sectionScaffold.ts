import { db } from "@workspace/db";
import { sectionsTable, eq } from "@workspace/db";
import { STANDARD_SECTION_SPECS } from "../lib/standardSections";

export async function scaffoldStandardSections(workspaceId: number): Promise<typeof sectionsTable.$inferSelect[]> {
  const existing = await db
    .select()
    .from(sectionsTable)
    .where(eq(sectionsTable.workspaceId, workspaceId));

  if (existing.length > 0) {
    return existing;
  }

  const rows = await db
    .insert(sectionsTable)
    .values(
      STANDARD_SECTION_SPECS.map((spec, index) => ({
        workspaceId,
        title: spec.title,
        type: spec.type,
        status: "not_started" as const,
        order: index,
        minPages: spec.minPages,
        maxPages: spec.maxPages,
        targetPages: spec.targetPages,
      })),
    )
    .returning();

  return rows;
}
