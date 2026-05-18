import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workspacesTable } from "./workspaces";

export const sectionsTable = pgTable("sections", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  type: text("type", {
    enum: ["introduction", "literature_review", "methodology", "results", "discussion", "conclusion", "abstract", "references", "custom"],
  }).notNull().default("custom"),
  content: text("content"),
  status: text("status", {
    enum: ["not_started", "in_progress", "completed", "reviewed"],
  }).notNull().default("not_started"),
  order: integer("order").notNull().default(0),
  wordCount: integer("word_count"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSectionSchema = createInsertSchema(sectionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const selectSectionSchema = createSelectSchema(sectionsTable);
export type InsertSection = z.infer<typeof insertSectionSchema>;
export type Section = typeof sectionsTable.$inferSelect;
