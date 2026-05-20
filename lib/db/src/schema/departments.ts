import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";

export const departmentsTable = pgTable("departments", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  qualificationLevels: text("qualification_levels").array().notNull().default(["pg"]),
  regulatoryBody: text("regulatory_body").notNull().default("NMC"),
});

export const departmentThesisTemplatesTable = pgTable("department_thesis_templates", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id")
    .notNull()
    .references(() => departmentsTable.id, { onDelete: "cascade" }),
  qualificationLevel: text("qualification_level").notNull().default("pg"),
  preliminaryPagesJson: jsonb("preliminary_pages_json")
    .$type<Array<Record<string, unknown>>>()
    .notNull()
    .default([]),
  chaptersJson: jsonb("chapters_json").$type<Array<Record<string, unknown>>>().notNull().default([]),
  annexuresJson: jsonb("annexures_json").$type<Array<Record<string, unknown>>>().notNull().default([]),
  defaultPageLimitMin: integer("default_page_limit_min"),
  defaultPageLimitMax: integer("default_page_limit_max"),
  chapterBlueprintSeedJson: jsonb("chapter_blueprint_seed_json")
    .$type<Array<Record<string, unknown>>>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const universityDepartmentOverridesTable = pgTable("university_department_overrides", {
  id: serial("id").primaryKey(),
  universityName: text("university_name").notNull(),
  departmentId: integer("department_id")
    .notNull()
    .references(() => departmentsTable.id, { onDelete: "cascade" }),
  qualificationLevel: text("qualification_level").notNull().default("pg"),
  overrideJson: jsonb("override_json").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const guidelineSearchCacheTable = pgTable("guideline_search_cache", {
  id: serial("id").primaryKey(),
  cacheKey: text("cache_key").notNull().unique(),
  resultsJson: jsonb("results_json").$type<Array<Record<string, unknown>>>().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const selectDepartmentSchema = createSelectSchema(departmentsTable);
export const selectDepartmentThesisTemplateSchema = createSelectSchema(departmentThesisTemplatesTable);
export const selectUniversityDepartmentOverrideSchema = createSelectSchema(universityDepartmentOverridesTable);
export const selectGuidelineSearchCacheSchema = createSelectSchema(guidelineSearchCacheTable);

export type Department = typeof departmentsTable.$inferSelect;
export type DepartmentThesisTemplate = typeof departmentThesisTemplatesTable.$inferSelect;
export type UniversityDepartmentOverride = typeof universityDepartmentOverridesTable.$inferSelect;
export type GuidelineSearchCache = typeof guidelineSearchCacheTable.$inferSelect;
