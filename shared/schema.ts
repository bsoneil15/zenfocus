import { pgTable, text, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";
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

export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  subscribed: boolean("subscribed").notNull().default(true),
  subscribedAt: timestamp("subscribed_at").defaultNow(),
});

export const soundscapePacks = pgTable("soundscape_packs", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description").notNull(),
  isUnlocked: boolean("is_unlocked").notNull().default(false),
  unlockedBy: text("unlocked_by").notNull(),
  soundscapeIds: text("soundscape_ids").array().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSoundscapeSchema = createInsertSchema(soundscapes).omit({
  id: true,
  createdAt: true,
});

export const insertPomodoroSessionSchema = createInsertSchema(pomodoroSessions).omit({
  id: true,
  createdAt: true,
});

export const insertNewsletterSubscriberSchema = createInsertSchema(newsletterSubscribers).omit({
  id: true,
  subscribedAt: true,
});

export const insertSoundscapePackSchema = createInsertSchema(soundscapePacks).omit({
  id: true,
  createdAt: true,
});

export type Soundscape = typeof soundscapes.$inferSelect;
export type InsertSoundscape = z.infer<typeof insertSoundscapeSchema>;
export type PomodoroSession = typeof pomodoroSessions.$inferSelect;
export type InsertPomodoroSession = z.infer<typeof insertPomodoroSessionSchema>;
export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type InsertNewsletterSubscriber = z.infer<typeof insertNewsletterSubscriberSchema>;
export type SoundscapePack = typeof soundscapePacks.$inferSelect;
export type InsertSoundscapePack = z.infer<typeof insertSoundscapePackSchema>;
