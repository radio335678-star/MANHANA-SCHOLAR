import { pgTable, serial, integer, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workspacesTable } from "./workspaces";

export const universityGuidelineTemplatesTable = pgTable("university_guideline_templates", {
  id: serial("id").primaryKey(),
  universityName: text("university_name").notNull(),
  domain: text("domain").notNull(),
  qualificationLevel: text("qualification_level").notNull().default("pg"),
  rulesJson: jsonb("rules_json").$type<Record<string, unknown>>().notNull(),
  version: text("version").notNull().default("1.0"),
  effectiveYear: integer("effective_year").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const domainSectionTemplatesTable = pgTable("domain_section_templates", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull(),
  qualificationLevel: text("qualification_level").notNull().default("pg"),
  sectionsJson: jsonb("sections_json").$type<Array<Record<string, unknown>>>().notNull(),
  pageLimitMin: integer("page_limit_min"),
  pageLimitMax: integer("page_limit_max"),
  fontSpacingNotes: text("font_spacing_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const preThesisBuildJobsTable = pgTable("pre_thesis_build_jobs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspacesTable.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["queued", "running", "completed", "failed"],
  })
    .notNull()
    .default("queued"),
  currentAgent: text("current_agent"),
  telemetry: jsonb("telemetry").$type<Array<Record<string, unknown>>>().default([]),
  error: text("error"),
  idempotencyKey: text("idempotency_key"),
  buildVersion: integer("build_version").notNull().default(2),
  resultJson: jsonb("result_json").$type<Record<string, unknown> | null>(),
  warnings: jsonb("warnings").$type<string[]>().default([]),
  completenessScore: integer("completeness_score"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const preThesisSourcesTable = pgTable("pre_thesis_sources", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspacesTable.id, { onDelete: "cascade" }),
  buildJobId: integer("build_job_id").references(() => preThesisBuildJobsTable.id, {
    onDelete: "set null",
  }),
  attribution: text("attribution", { enum: ["template", "live"] }).notNull(),
  url: text("url"),
  title: text("title").notNull(),
  snippet: text("snippet"),
  storagePath: text("storage_path"),
  confidence: text("confidence"),
  sourceType: text("source_type"),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
});

export const preThesisConflictsTable = pgTable("pre_thesis_conflicts", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspacesTable.id, { onDelete: "cascade" }),
  buildJobId: integer("build_job_id").references(() => preThesisBuildJobsTable.id, {
    onDelete: "set null",
  }),
  fieldKey: text("field_key").notNull(),
  templateValue: text("template_value"),
  liveValue: text("live_value"),
  severity: text("severity", { enum: ["info", "warning", "critical"] })
    .notNull()
    .default("warning"),
  resolved: boolean("resolved").notNull().default(false),
  appliedValue: text("applied_value"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const preThesisChatMessagesTable = pgTable("pre_thesis_chat_messages", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspacesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull(),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  toolCallsJson: jsonb("tool_calls_json").$type<Record<string, unknown>[] | null>(),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const preThesisDocumentRevisionsTable = pgTable("pre_thesis_document_revisions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspacesTable.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  resultJson: jsonb("result_json").$type<Record<string, unknown>>().notNull(),
  draftMd: text("draft_md").notNull(),
  completenessScore: integer("completeness_score"),
  createdByUserId: integer("created_by_user_id"),
  source: text("source", { enum: ["build", "ai", "revalidate", "undo"] }).notNull(),
  summary: text("summary"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const preThesisLockEventsTable = pgTable("pre_thesis_lock_events", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspacesTable.id, { onDelete: "cascade" }),
  mdHash: text("md_hash").notNull(),
  lockedByUserId: integer("locked_by_user_id").notNull(),
  sourceSnapshotPath: text("source_snapshot_path"),
  unlockedAt: timestamp("unlocked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const selectUniversityGuidelineTemplateSchema = createSelectSchema(universityGuidelineTemplatesTable);
export const selectDomainSectionTemplateSchema = createSelectSchema(domainSectionTemplatesTable);
export const selectPreThesisBuildJobSchema = createSelectSchema(preThesisBuildJobsTable);
export const selectPreThesisSourceSchema = createSelectSchema(preThesisSourcesTable);
export const selectPreThesisConflictSchema = createSelectSchema(preThesisConflictsTable);
export const selectPreThesisLockEventSchema = createSelectSchema(preThesisLockEventsTable);

export type UniversityGuidelineTemplate = typeof universityGuidelineTemplatesTable.$inferSelect;
export type DomainSectionTemplate = typeof domainSectionTemplatesTable.$inferSelect;
export type PreThesisBuildJob = typeof preThesisBuildJobsTable.$inferSelect;
export type PreThesisSource = typeof preThesisSourcesTable.$inferSelect;
export type PreThesisConflict = typeof preThesisConflictsTable.$inferSelect;
export type PreThesisLockEvent = typeof preThesisLockEventsTable.$inferSelect;
export type PreThesisChatMessage = typeof preThesisChatMessagesTable.$inferSelect;
export type PreThesisDocumentRevision = typeof preThesisDocumentRevisionsTable.$inferSelect;
