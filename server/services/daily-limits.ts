import type { Request } from "express";
import { isIP } from "net";

export const DAILY_SOUNDSCAPE_LIMIT = 3;

interface DailyEntry {
  date: string;
  count: number;
}

const store = new Map<string, DailyEntry>();

function todayKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function getClientIp(req: Request): string {
  const realIp = req.headers["x-real-ip"];
  if (realIp && typeof realIp === "string") {
    const trimmed = realIp.trim();
    if (isIP(trimmed) !== 0) return trimmed;
  }

  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    const trimmed = ip.trim();
    if (isIP(trimmed) !== 0) return trimmed;
  }

  return req.socket.remoteAddress?.trim() || "unknown";
}

export function getDailyLimitKey(req: Request): string {
  const userId = (req as any).user?.claims?.sub as string | undefined;
  if (userId) return `user:${userId}`;
  return `ip:${getClientIp(req)}`;
}

function getOrInitEntry(key: string): DailyEntry {
  const today = todayKey();
  const entry = store.get(key);
  if (!entry || entry.date !== today) {
    const fresh = { date: today, count: 0 };
    store.set(key, fresh);
    return fresh;
  }
  return entry;
}

export function getDailyUsage(req: Request): { used: number; remaining: number; limit: number } {
  const key = getDailyLimitKey(req);
  const entry = getOrInitEntry(key);
  return {
    used: entry.count,
    remaining: Math.max(0, DAILY_SOUNDSCAPE_LIMIT - entry.count),
    limit: DAILY_SOUNDSCAPE_LIMIT,
  };
}

export function canGenerate(req: Request): boolean {
  const key = getDailyLimitKey(req);
  const entry = getOrInitEntry(key);
  return entry.count < DAILY_SOUNDSCAPE_LIMIT;
}

export function incrementDailyUsage(req: Request): { used: number; remaining: number; limit: number } {
  const key = getDailyLimitKey(req);
  const entry = getOrInitEntry(key);
  entry.count += 1;
  store.set(key, entry);
  return {
    used: entry.count,
    remaining: Math.max(0, DAILY_SOUNDSCAPE_LIMIT - entry.count),
    limit: DAILY_SOUNDSCAPE_LIMIT,
  };
}

setInterval(() => {
  const today = todayKey();
  const stale: string[] = [];
  store.forEach((entry, key) => {
    if (entry.date !== today) stale.push(key);
  });
  stale.forEach((key) => store.delete(key));
}, 60 * 60 * 1000).unref?.();
