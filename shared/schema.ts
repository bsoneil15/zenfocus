import { pgTable, text, varchar, integer, boolean, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const soundscapes = pgTable("soundscapes", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  audioUrl: text("audio_url").notNull(),
  duration: integer("duration").notNull().default(30),
  isPublic: boolean("is_public").notNull().default(false),
  ownerId: varchar("owner_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pomodoroSessions = pgTable("pomodoro_sessions", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  duration: integer("duration").notNull(),
  isBreak: boolean("is_break").notNull().default(false),
  completed: boolean("completed").notNull().default(false),
  soundscapeId: varchar("soundscape_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dailyUsage = pgTable("daily_usage", {
  key: text("key").notNull(),
  date: text("date").notNull(),
  count: integer("count").notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.key, table.date] }),
}));

export type DailyUsageRow = typeof dailyUsage.$inferSelect;

export const insertSoundscapeSchema = createInsertSchema(soundscapes).omit({
  id: true,
  createdAt: true,
});

export const insertPomodoroSessionSchema = createInsertSchema(pomodoroSessions).omit({
  id: true,
  createdAt: true,
});

export type Soundscape = typeof soundscapes.$inferSelect;
export type InsertSoundscape = z.infer<typeof insertSoundscapeSchema>;
export type PomodoroSession = typeof pomodoroSessions.$inferSelect;
export type InsertPomodoroSession = z.infer<typeof insertPomodoroSessionSchema>;
