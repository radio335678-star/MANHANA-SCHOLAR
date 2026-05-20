import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { masterChartsTable } from "./master_charts";

export const masterChartContextFilesTable = pgTable("master_chart_context_files", {
  id: serial("id").primaryKey(),
  chartId: integer("chart_id")
    .notNull()
    .references(() => masterChartsTable.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type"),
  extractedText: text("extracted_text"),
  storagePath: text("storage_path"),
  vaultResourceId: integer("vault_resource_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMasterChartContextFileSchema = createInsertSchema(
  masterChartContextFilesTable,
).omit({ id: true, createdAt: true });
export const selectMasterChartContextFileSchema = createSelectSchema(masterChartContextFilesTable);
export type MasterChartContextFile = typeof masterChartContextFilesTable.$inferSelect;
