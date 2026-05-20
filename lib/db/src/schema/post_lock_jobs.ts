import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workspacesTable } from "./workspaces";

export const postLockJobsTable = pgTable("post_lock_jobs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspacesTable.id, { onDelete: "cascade" }),
  jobType: text("job_type", { enum: ["upload_locked_pre_thesis_docx"] }).notNull(),
  status: text("status", { enum: ["pending", "processing", "completed", "failed"] })
    .notNull()
    .default("pending"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  lastError: text("last_error"),
  vaultResourceId: integer("vault_resource_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  nextRetryAt: timestamp("next_retry_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPostLockJobSchema = createInsertSchema(postLockJobsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const selectPostLockJobSchema = createSelectSchema(postLockJobsTable);
export type PostLockJob = typeof postLockJobsTable.$inferSelect;
export type InsertPostLockJob = z.infer<typeof insertPostLockJobSchema>;
