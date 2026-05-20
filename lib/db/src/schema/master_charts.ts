import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workspacesTable } from "./workspaces";
import { sectionsTable } from "./sections";

export const masterChartsTable = pgTable("master_charts", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspacesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mode: text("mode", {
    enum: ["chat_to_excel", "upload_modify", "auto_from_methods"],
  }).notNull(),
  currentVersion: integer("current_version").notNull().default(0),
  studyDesign: jsonb("study_design").$type<Record<string, unknown> | null>(),
  linkedSectionId: integer("linked_section_id").references(() => sectionsTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const masterChartVersionsTable = pgTable("master_chart_versions", {
  id: serial("id").primaryKey(),
  chartId: integer("chart_id")
    .notNull()
    .references(() => masterChartsTable.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  storagePath: text("storage_path").notNull(),
  schemaJson: jsonb("schema_json").$type<Record<string, unknown> | null>(),
  statsSummary: jsonb("stats_summary").$type<Record<string, unknown> | null>(),
  vaultResourceId: integer("vault_resource_id"),
  modelUsed: text("model_used"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMasterChartSchema = createInsertSchema(masterChartsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const selectMasterChartSchema = createSelectSchema(masterChartsTable);
export const selectMasterChartVersionSchema = createSelectSchema(masterChartVersionsTable);

export type MasterChart = typeof masterChartsTable.$inferSelect;
export type MasterChartVersion = typeof masterChartVersionsTable.$inferSelect;
export type InsertMasterChart = z.infer<typeof insertMasterChartSchema>;
