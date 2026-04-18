import type { Request } from "express";
import { isIP } from "net";
import { storage } from "../storage";

export const DAILY_SOUNDSCAPE_LIMIT = 3;

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

setInterval(() => {
  storage.cleanupStaleDailyUsage(todayKey()).catch((err) => {
    console.error("Failed to clean up stale daily usage rows:", err);
  });
}, 60 * 60 * 1000).unref?.();
