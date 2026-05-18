import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";

export const domainsTable = pgTable("domains", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  color: text("color"),
});

export const qualificationsTable = pgTable("qualifications", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  abbreviation: text("abbreviation").notNull(),
  domain: text("domain").notNull(),
  level: text("level").notNull(),
});

export const universitiesTable = pgTable("universities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
});

export const collegesTable = pgTable("colleges", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  domain: text("domain").notNull(),
  universityId: integer("university_id").references(() => universitiesTable.id),
});

export const selectDomainSchema = createSelectSchema(domainsTable);
export const selectQualificationSchema = createSelectSchema(qualificationsTable);
export const selectUniversitySchema = createSelectSchema(universitiesTable);
export const selectCollegeSchema = createSelectSchema(collegesTable);

export type Domain = typeof domainsTable.$inferSelect;
export type Qualification = typeof qualificationsTable.$inferSelect;
export type University = typeof universitiesTable.$inferSelect;
export type College = typeof collegesTable.$inferSelect;
