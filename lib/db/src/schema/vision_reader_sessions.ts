import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { workspacesTable } from "./workspaces";

export type VisionFileInfo = {
  name: string;
  size: number;
  mimeType: string;
  kimiFileId?: string;
};

export const visionReaderSessionsTable = pgTable("vision_reader_sessions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspacesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull(),
  filesInfo: jsonb("files_info").$type<VisionFileInfo[]>(),
  outputText: text("output_text"),
  userPrompt: text("user_prompt"),
  modelUsed: text("model_used"),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type VisionReaderSession = typeof visionReaderSessionsTable.$inferSelect;
