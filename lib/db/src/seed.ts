/**
 * Run: pnpm db:seed
 * Requires DATABASE_URL
 */
import { loadWorkspaceEnv } from "../../env/loadEnv";
import pg from "pg";

loadWorkspaceEnv();
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedsDir = path.join(__dirname, "..", "seeds");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");

  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  });
  const client = await pool.connect();

  try {
    const domainTemplates = JSON.parse(
      readFileSync(path.join(seedsDir, "domain_section_templates.json"), "utf-8"),
    ) as Array<{
      domain: string;
      qualificationLevel: string;
      sectionsJson: unknown[];
      pageLimitMin: number;
      pageLimitMax: number;
      fontSpacingNotes: string;
    }>;

    for (const t of domainTemplates) {
      await client.query(
        `INSERT INTO domain_section_templates (domain, qualification_level, sections_json, page_limit_min, page_limit_max, font_spacing_notes)
         SELECT $1, $2, $3::jsonb, $4, $5, $6
         WHERE NOT EXISTS (
           SELECT 1 FROM domain_section_templates WHERE domain = $1 AND qualification_level = $2
         )`,
        [t.domain, t.qualificationLevel, JSON.stringify(t.sectionsJson), t.pageLimitMin, t.pageLimitMax, t.fontSpacingNotes],
      );
    }

    const uniTemplates = JSON.parse(
      readFileSync(path.join(seedsDir, "university_guideline_templates.json"), "utf-8"),
    ) as Array<{
      universityName: string;
      domain: string;
      qualificationLevel: string;
      rulesJson: Record<string, unknown>;
      version: string;
      effectiveYear: number;
    }>;

    for (const u of uniTemplates) {
      await client.query(
        `INSERT INTO university_guideline_templates (university_name, domain, qualification_level, rules_json, version, effective_year)
         SELECT $1, $2, $3, $4::jsonb, $5, $6
         WHERE NOT EXISTS (
           SELECT 1 FROM university_guideline_templates
           WHERE university_name = $1 AND domain = $2 AND qualification_level = $3
         )`,
        [u.universityName, u.domain, u.qualificationLevel, JSON.stringify(u.rulesJson), u.version, u.effectiveYear],
      );
    }

    const departments = JSON.parse(
      readFileSync(path.join(seedsDir, "departments.json"), "utf-8"),
    ) as Array<{
      domain: string;
      name: string;
      slug: string;
      qualificationLevels: string[];
      regulatoryBody: string;
    }>;

    const deptIdBySlug = new Map<string, number>();

    for (const d of departments) {
      const res = await client.query(
        `INSERT INTO departments (domain, name, slug, qualification_levels, regulatory_body)
         SELECT $1, $2, $3, $4::text[], $5
         WHERE NOT EXISTS (SELECT 1 FROM departments WHERE domain = $1 AND slug = $3)
         RETURNING id`,
        [d.domain, d.name, d.slug, d.qualificationLevels, d.regulatoryBody],
      );
      if (res.rows[0]?.id) {
        deptIdBySlug.set(`${d.domain}:${d.slug}`, res.rows[0].id);
      } else {
        const existing = await client.query(
          `SELECT id FROM departments WHERE domain = $1 AND slug = $2`,
          [d.domain, d.slug],
        );
        if (existing.rows[0]) deptIdBySlug.set(`${d.domain}:${d.slug}`, existing.rows[0].id);
      }
    }

    const deptTemplates = JSON.parse(
      readFileSync(path.join(seedsDir, "department_thesis_templates.json"), "utf-8"),
    ) as Array<{
      departmentSlug: string;
      domain: string;
      qualificationLevel: string;
      preliminaryPagesJson: unknown[];
      chaptersJson: unknown[];
      annexuresJson: unknown[];
      defaultPageLimitMin: number;
      defaultPageLimitMax: number;
      chapterBlueprintSeedJson: unknown[];
    }>;

    for (const t of deptTemplates) {
      const deptId = deptIdBySlug.get(`${t.domain}:${t.departmentSlug}`);
      if (!deptId) continue;
      await client.query(
        `INSERT INTO department_thesis_templates (
          department_id, qualification_level, preliminary_pages_json, chapters_json,
          annexures_json, default_page_limit_min, default_page_limit_max, chapter_blueprint_seed_json
        )
        SELECT $1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM department_thesis_templates
          WHERE department_id = $1 AND qualification_level = $2
        )`,
        [
          deptId,
          t.qualificationLevel,
          JSON.stringify(t.preliminaryPagesJson),
          JSON.stringify(t.chaptersJson),
          JSON.stringify(t.annexuresJson),
          t.defaultPageLimitMin,
          t.defaultPageLimitMax,
          JSON.stringify(t.chapterBlueprintSeedJson),
        ],
      );
    }

    console.log(
      `Seed complete: domain templates, ${uniTemplates.length} universities, ${departments.length} departments, ${deptTemplates.length} dept templates`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
