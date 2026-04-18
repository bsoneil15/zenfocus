import type { Request, Response, NextFunction } from "express";
import { isIP } from "net";

interface RateLimitEntry {
  count: number;
  windowStart: number;
  lastRequest: number;
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private windowMs: number;
  private maxRequests: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(windowMs: number = 60 * 60 * 1000, maxRequests: number = 5) {
    this.windowMs = windowMs; // Default: 1 hour
    this.maxRequests = maxRequests; // Default: 5 requests per hour
    
    // Clean up expired entries every 10 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 10 * 60 * 1000);
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
    // Try multiple headers in order of reliability
    // X-Real-IP is typically set by reverse proxies and is harder to spoof
    const realIp = req.headers['x-real-ip'];
    if (realIp && typeof realIp === 'string') {
      const trimmedIp = realIp.trim();
      // Validate IP format to prevent spoofing attempts
      if (this.isValidIp(trimmedIp)) {
        return trimmedIp;
      }
    }
    
    // X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2, ...)
    // Use the first IP which should be the original client
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      const trimmedIp = ip.trim();
      
      // Basic IP validation to prevent obvious spoofing attempts
      if (this.isValidIp(trimmedIp)) {
        return trimmedIp;
      }
    }
    
    // Fallback to socket remote address (most reliable but may be proxy IP)
    const socketIp = req.socket.remoteAddress;
    if (socketIp) {
      return socketIp.trim();
    }
    
    // Last resort fallback
    return 'unknown';
  }
  
  private isValidIp(ip: string): boolean {
    // Use Node's built-in IP validation which properly handles:
    // - IPv4 with octet range validation (0-255)
    // - IPv6 in all forms (standard, compressed, hybrid)
    // Returns 4 for IPv4, 6 for IPv6, or 0 for invalid
    return isIP(ip) !== 0;
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
          message: `Too many soundscape generation requests. You can make ${this.maxRequests} requests per hour. Try again in ${remainingMinutes} minute(s).`,
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
  5 // Max 5 generations per hour per IP
);

export const suggestionsRateLimiter = new RateLimiter(
  10 * 60 * 1000, // 10 minute window  
  20 // Max 20 suggestion requests per 10 minutes per IP
);