import type { Request } from "express";
import { storage } from "../storage";

export const DAILY_SOUNDSCAPE_LIMIT = 3;

function todayKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function getClientIp(req: Request): string {
  // Use Express's trust-proxy-resolved client IP rather than reading raw
  // request headers, so attackers can't mint a fresh per-day quota bucket
  // simply by varying `X-Real-IP` or `X-Forwarded-For` on each request.
  // `app.set("trust proxy", 1)` is configured at startup, which makes
  // `req.ip` honor exactly one trusted reverse-proxy hop and ignore any
  // additional client-supplied entries.
  return req.ip?.trim() || req.socket.remoteAddress?.trim() || "unknown";
}

export function getDailyLimitKey(req: Request): string {
  const userId = (req as any).user?.claims?.sub as string | undefined;
  if (userId) return `user:${userId}`;
  return `ip:${getClientIp(req)}`;
}

function buildUsage(count: number) {
  return {
    used: count,
    remaining: Math.max(0, DAILY_SOUNDSCAPE_LIMIT - count),
    limit: DAILY_SOUNDSCAPE_LIMIT,
  };
}

export async function getDailyUsage(req: Request) {
  const key = getDailyLimitKey(req);
  const count = await storage.getDailyUsageCount(key, todayKey());
  return buildUsage(count);
}

export async function canGenerate(req: Request): Promise<boolean> {
  const key = getDailyLimitKey(req);
  const count = await storage.getDailyUsageCount(key, todayKey());
  return count < DAILY_SOUNDSCAPE_LIMIT;
}

export async function incrementDailyUsage(req: Request) {
  const key = getDailyLimitKey(req);
  const count = await storage.incrementDailyUsageCount(key, todayKey());
  return buildUsage(count);
}

export async function decrementDailyUsage(req: Request) {
  const key = getDailyLimitKey(req);
  const count = await storage.decrementDailyUsageCount(key, todayKey());
  return buildUsage(count);
}

setInterval(() => {
  storage.cleanupStaleDailyUsage(todayKey()).catch((err) => {
    console.error("Failed to clean up stale daily usage rows:", err);
  });
}, 60 * 60 * 1000).unref?.();
