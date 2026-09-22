import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  windowStart: number;
  lastRequest: number;
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private windowMs: number;
  private maxRequests: number;
  private resourceLabel: string;
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    windowMs: number = 60 * 60 * 1000,
    maxRequests: number = 5,
    resourceLabel: string = "requests",
  ) {
    this.windowMs = windowMs; // Default: 1 hour
    this.maxRequests = maxRequests; // Default: 5 requests per hour
    this.resourceLabel = resourceLabel;
    
    // Clean up expired entries every 10 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 10 * 60 * 1000);
  }

  private describeWindow(): string {
    const minutes = Math.round(this.windowMs / (60 * 1000));
    if (minutes >= 60 && minutes % 60 === 0) {
      const hours = minutes / 60;
      return hours === 1 ? "hour" : `${hours} hours`;
    }
    return minutes === 1 ? "minute" : `${minutes} minutes`;
  }

  private cleanup() {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    this.store.forEach((entry, key) => {
      // Remove entries older than 2 windows to be safe
      if (now - entry.windowStart > this.windowMs * 2) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.store.delete(key));
  }

  private getClientKey(req: Request): string {
    // Use Express's trust-proxy-resolved client IP. With
    // `app.set("trust proxy", 1)` configured at startup, `req.ip` returns
    // the left-most untrusted address from `X-Forwarded-For` (i.e. the
    // real client IP as reported by the single trusted reverse proxy in
    // front of us), and falls back to the socket remote address otherwise.
    //
    // Crucially, this means the limiter ignores attacker-supplied headers
    // such as `X-Real-IP` or extra `X-Forwarded-For` entries beyond the
    // trusted hop, so anonymous callers can't bucket-hop their way past
    // the per-IP quota by varying those headers.
    const ip = req.ip?.trim();
    if (ip) return ip;

    const socketIp = req.socket.remoteAddress?.trim();
    if (socketIp) return socketIp;

    return "unknown";
  }

  public middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = this.getClientKey(req);
      const now = Date.now();
      
      let entry = this.store.get(key);
      
      if (!entry) {
        // First request from this client
        entry = {
          count: 1,
          windowStart: now,
          lastRequest: now
        };
        this.store.set(key, entry);
        return next();
      }

      // Check if we need to reset the window
      if (now - entry.windowStart >= this.windowMs) {
        entry.count = 1;
        entry.windowStart = now;
        entry.lastRequest = now;
        return next();
      }

      // Check if rate limit exceeded
      if (entry.count >= this.maxRequests) {
        const resetTime = new Date(entry.windowStart + this.windowMs);
        const remainingMs = entry.windowStart + this.windowMs - now;
        const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));

        res.status(429).json({
          error: "Rate limit exceeded",
          message: `Too many ${this.resourceLabel}. You can make ${this.maxRequests} requests per ${this.describeWindow()}. Try again in ${remainingMinutes} minute(s).`,
          retryAfter: remainingMs,
          resetTime: resetTime.toISOString(),
          currentCount: entry.count,
          maxRequests: this.maxRequests
        });
        return;
      }

      // Update the entry
      entry.count++;
      entry.lastRequest = now;
      
      next();
    };
  }

  public getStatus(req: Request): { count: number; maxRequests: number; resetTime: Date } {
    const key = this.getClientKey(req);
    const entry = this.store.get(key);
    const now = Date.now();
    
    if (!entry || now - entry.windowStart >= this.windowMs) {
      return {
        count: 0,
        maxRequests: this.maxRequests,
        resetTime: new Date(now + this.windowMs)
      };
    }

    return {
      count: entry.count,
      maxRequests: this.maxRequests,
      resetTime: new Date(entry.windowStart + this.windowMs)
    };
  }

  public destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

// Create rate limiters for different endpoints
export const soundscapeRateLimiter = new RateLimiter(
  60 * 60 * 1000, // 1 hour window
  5, // Max 5 generations per hour per IP
  "soundscape generation requests",
);

export const suggestionsRateLimiter = new RateLimiter(
  10 * 60 * 1000, // 10 minute window  
  20, // Max 20 suggestion requests per 10 minutes per IP
  "suggestion requests",
);
