import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workspacesTable } from "./workspaces";

export const vaultResourcesTable = pgTable("vault_resources", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["paper", "note", "reference", "image", "link"],
  }).notNull(),
  title: text("title").notNull(),
  content: text("content"),
  url: text("url"),
  authors: text("authors"),
  year: integer("year"),
  journal: text("journal"),
  doi: text("doi"),
  tags: text("tags"),
  storagePath: text("storage_path"),
  mimeType: text("mime_type"),
  processingStatus: text("processing_status", {
    enum: ["pending", "processing", "ready", "failed"],
  })
    .notNull()
    .default("ready"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVaultResourceSchema = createInsertSchema(vaultResourcesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const selectVaultResourceSchema = createSelectSchema(vaultResourcesTable);
export type InsertVaultResource = z.infer<typeof insertVaultResourceSchema>;
export type VaultResource = typeof vaultResourcesTable.$inferSelect;
