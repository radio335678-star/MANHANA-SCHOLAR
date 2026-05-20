import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workspacesTable } from "./workspaces";
import { usersTable } from "./users";

export const workspaceStateTransitionsTable = pgTable("workspace_state_transitions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspacesTable.id, { onDelete: "cascade" }),
  fromState: text("from_state").notNull(),
  toState: text("to_state").notNull(),
  actorUserId: integer("actor_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  reason: text("reason"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWorkspaceStateTransitionSchema = createInsertSchema(
  workspaceStateTransitionsTable,
).omit({ id: true, createdAt: true });
export const selectWorkspaceStateTransitionSchema = createSelectSchema(workspaceStateTransitionsTable);
export type InsertWorkspaceStateTransition = z.infer<typeof insertWorkspaceStateTransitionSchema>;
export type WorkspaceStateTransition = typeof workspaceStateTransitionsTable.$inferSelect;
