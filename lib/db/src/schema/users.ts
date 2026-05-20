import { pgTable, serial, text, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  supabaseUserId: uuid("supabase_user_id").unique(),
  role: text("role", { enum: ["scholar", "admin"] }).notNull().default("scholar"),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  domain: text("domain").notNull(),
  qualification: text("qualification").notNull(),
  collegeName: text("college_name"),
  universityName: text("university_name"),
  guideNames: text("guide_names"),
  city: text("city"),
  state: text("state"),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const selectUserSchema = createSelectSchema(usersTable);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
