import { pgTable, serial, integer, text, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { departmentsTable } from "./departments";

export const workspacesTable = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  ownerUuid: uuid("owner_uuid"),
  title: text("title").notNull(),
  description: text("description"),
  domain: text("domain").notNull(),
  qualification: text("qualification"),
  guideName: text("guide_name"),
  coGuideName: text("co_guide_name"),
  collegeName: text("college_name"),
  state: text("state"),
  universityName: text("university_name"),
  departmentId: integer("department_id").references(() => departmentsTable.id, { onDelete: "set null" }),
  candidateName: text("candidate_name"),
  hodName: text("hod_name"),
  synopsisText: text("synopsis_text"),
  synopsisStoragePath: text("synopsis_storage_path"),
  studyType: text("study_type"),
  preThesisBuildVersion: integer("pre_thesis_build_version").default(1),
  status: text("status", { enum: ["active", "completed", "archived"] }).notNull().default("active"),
  workflowState: text("workflow_state", {
    enum: ["init", "pre_setup", "locked_in", "section_build", "review", "complete", "archived"],
  })
    .notNull()
    .default("init"),
  preThesisDraftMd: text("pre_thesis_draft_md"),
  preThesisLockedMd: text("pre_thesis_locked_md"),
  preThesisMdHash: text("pre_thesis_md_hash"),
  preThesisChecklist: jsonb("pre_thesis_checklist").$type<Record<string, boolean> | null>(),
  researchNotes: text("research_notes"),
  lastLiveVerifiedAt: timestamp("last_live_verified_at"),
  lockedAt: timestamp("locked_at"),
  autoCompleteStatus: text("auto_complete_status").default("idle"),
  autoCompleteCurrentSection: integer("auto_complete_current_section"),
  humaniserIntensity: integer("humaniser_intensity").notNull().default(4),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWorkspaceSchema = createInsertSchema(workspacesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const selectWorkspaceSchema = createSelectSchema(workspacesTable);
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type Workspace = typeof workspacesTable.$inferSelect;
