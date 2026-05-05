import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { insertSoundscapeSchema } from "@shared/schema";
import { isAuthenticated } from "./replit_integrations/auth";
import { generateFocusPrompts, generateSoundscapeName } from "./services/openai";
import { generateSound, getElevenLabsHealth, checkElevenLabsHealth } from "./services/elevenlabs";
import { soundscapeRateLimiter, suggestionsRateLimiter } from "./middleware/rate-limiter";
import {
  incrementDailyUsage as incrementDailyUsageServer,
  decrementDailyUsage as decrementDailyUsageServer,
  getDailyUsage as getDailyUsageServer,
  DAILY_SOUNDSCAPE_LIMIT,
  incrementDailySuggestionsUsage,
  decrementDailySuggestionsUsage,
  DAILY_SUGGESTIONS_LIMIT,
} from "./services/daily-limits";
import {
  ObjectStorageService,
  ObjectNotFoundError,
  ObjectPermission,
  canAccessObject,
  objectStorageClient,
  setObjectAclPolicy,
} from "./replit_integrations/object_storage";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/rate-limit/status", (req, res) => {
    const soundscapeStatus = soundscapeRateLimiter.getStatus(req);
    const suggestionsStatus = suggestionsRateLimiter.getStatus(req);
    
    res.json({
      soundscapeGeneration: {
        remaining: soundscapeStatus.maxRequests - soundscapeStatus.count,
        total: soundscapeStatus.maxRequests,
        used: soundscapeStatus.count,
        resetTime: soundscapeStatus.resetTime
      },
      suggestions: {
        remaining: suggestionsStatus.maxRequests - suggestionsStatus.count,
        total: suggestionsStatus.maxRequests,
        used: suggestionsStatus.count,
        resetTime: suggestionsStatus.resetTime
      }
    });
  });

  app.get("/api/soundscapes/daily-limit", async (req, res) => {
    try {
      const usage = await getDailyUsageServer(req);
      res.json(usage);
    } catch (error) {
      console.error("Failed to read daily usage:", error);
      res.status(500).json({ message: "Failed to read daily usage" });
    }
  });

  app.get("/api/soundscapes/hourly-limit", (req, res) => {
    const status = soundscapeRateLimiter.getStatus(req);
    const now = Date.now();
    const remainingMs = status.resetTime.getTime() - now;
    const resetInMinutes = Math.max(0, Math.ceil(remainingMs / (60 * 1000)));
    res.json({
      used: status.count,
      remaining: Math.max(0, status.maxRequests - status.count),
      limit: status.maxRequests,
      resetInMinutes,
    });
  });

  // Require authentication: this endpoint triggers a paid OpenAI call, and
  // the frontend only ever invokes it for signed-in users. Gating server-side
  // prevents anonymous traffic (or scripted abuse) from spending OpenAI
  // credits.
  //
  // Two complementary abuse controls are applied:
  //   1. Per-account daily quota (DAILY_SUGGESTIONS_LIMIT) stored in the DB so
  //      it is durable across process restarts and consistent across deployment
  //      instances. Keyed on the authenticated user ID, so it follows the
  //      account regardless of which IP the request arrives from.
  //   2. suggestionsRateLimiter — per-IP backstop (20 per 10 min) as a
  //      secondary throttle against burst traffic from a single network address.
  app.get(
    "/api/soundscapes/suggestions",
    isAuthenticated,
    suggestionsRateLimiter.middleware(),
    async (req, res) => {
      // Extract the authenticated user ID. isAuthenticated ensures req.user
      // is present before we reach this handler.
      const userId = (req.user as { claims?: { sub?: string } })?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Atomically reserve a daily slot. If the new count exceeds the limit,
      // refund the slot immediately and reject. Increment-then-check avoids a
      // TOCTOU race between concurrent requests from the same account.
      const usage = await incrementDailySuggestionsUsage(userId);
      if (usage.used > DAILY_SUGGESTIONS_LIMIT) {
        let refundedUsage = usage;
        try {
          refundedUsage = await decrementDailySuggestionsUsage(userId);
        } catch (refundErr) {
          console.error("Failed to refund over-limit suggestions slot:", refundErr);
        }
        return res.status(429).json({
          code: "suggestions_daily_limit_reached",
          message: `You've reached your daily limit of ${DAILY_SUGGESTIONS_LIMIT} suggestion requests. Try again tomorrow!`,
          ...refundedUsage,
        });
      }

      try {
        const suggestions = await generateFocusPrompts();
        res.json({ suggestions });
      } catch (error) {
        // Refund the reserved slot so a transient upstream failure doesn't
        // consume the user's daily quota.
        try {
          await decrementDailySuggestionsUsage(userId);
        } catch (refundErr) {
          console.error("Failed to refund suggestions daily slot:", refundErr);
        }
        console.error("Failed to generate suggestions:", error);
        res.status(500).json({
          message: "Failed to generate suggestions",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  app.get("/api/soundscapes", async (req, res) => {
    try {
      // Only public soundscapes are exposed on this endpoint. Per-user
      // soundscapes are returned by /api/soundscapes/mine which requires auth.
      const all = await storage.getSoundscapes();
      const soundscapes = all.filter(s => s.isPublic);
      res.json({ soundscapes });
    } catch (error) {
      console.error("Failed to get soundscapes:", error);
      res.status(500).json({ 
        message: "Failed to get soundscapes",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/soundscapes/generate", isAuthenticated, soundscapeRateLimiter.middleware(), async (req, res) => {
    const generateRequestSchema = z.object({
      prompt: z.string().min(1).max(500),
      duration: z.number().min(21).max(21).default(21),
      looping: z.boolean().default(true),
      promptInfluence: z.number().min(0).max(1).default(0.7),
    });

    let validatedData: z.infer<typeof generateRequestSchema>;
    try {
      validatedData = generateRequestSchema.parse(req.body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          code: "invalid_request",
          message: "Invalid request data",
          errors: error.errors,
        });
      }
      throw error;
    }

    // Atomically reserve a daily slot before doing any expensive work. If
    // the increment pushes us over the per-day limit, immediately refund
    // the slot and reject. This prevents two concurrent requests from both
    // passing a check-then-increment race and exceeding the quota.
    let reservedUsage = await incrementDailyUsageServer(req);
    if (reservedUsage.used > DAILY_SOUNDSCAPE_LIMIT) {
      await decrementDailyUsageServer(req);
      const usage = await getDailyUsageServer(req);
      return res.status(429).json({
        code: "daily_limit_reached",
        message: `You've reached your daily limit of ${DAILY_SOUNDSCAPE_LIMIT} custom soundscapes. Try again tomorrow!`,
        ...usage,
      });
    }

    let slotConsumed = true;
    const refundSlot = async () => {
      if (!slotConsumed) return;
      slotConsumed = false;
      try {
        await decrementDailyUsageServer(req);
      } catch (refundErr) {
        console.error("Failed to refund daily generation slot:", refundErr);
      }
    };

    try {
      const ownerId = (req.user as any)?.claims?.sub ?? null;

      const soundResult = await generateSound({
        prompt: validatedData.prompt,
        duration: validatedData.duration,
        looping: validatedData.looping,
        promptInfluence: validatedData.promptInfluence,
      }, ownerId ?? undefined);

      let name;
      try {
        name = await generateSoundscapeName(validatedData.prompt);
      } catch (nameError) {
        console.error("Error in generateSoundscapeName:", nameError);
        name = "Custom Soundscape";
      }

      const soundscape = await storage.createSoundscape({
        name,
        prompt: validatedData.prompt,
        audioUrl: soundResult.audioUrl,
        duration: soundResult.duration,
        isPublic: false,
        ownerId,
      });

      // Slot is now genuinely consumed by a successful create; mark it as
      // such so the catch block won't refund it.
      slotConsumed = false;

      const dailyUsage = await getDailyUsageServer(req);

      res.json({
        id: soundscape.id,
        name: soundscape.name,
        audioUrl: soundscape.audioUrl,
        prompt: soundscape.prompt,
        duration: soundscape.duration,
        dailyUsage,
      });
    } catch (error) {
      await refundSlot();
      console.error("Failed to generate soundscape:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          code: "invalid_request",
          message: "Invalid request data",
          errors: error.errors,
        });
      }

      const raw = error instanceof Error ? error.message : "Unknown error";

      // Map known ElevenLabs failures to a friendly user-facing message.
      // ElevenLabs failures bubble up as: "Sound generation failed: ElevenLabs API error: <status> - <body>"
      const elevenLabsMatch = raw.match(/ElevenLabs API error:\s*(\d+)/i);
      if (elevenLabsMatch) {
        const status = parseInt(elevenLabsMatch[1], 10);
        if (status === 401 || status === 403) {
          return res.status(502).json({
            code: "elevenlabs_auth",
            message: "ElevenLabs rejected the API key. Please check your ELEVENLABS_API_KEY.",
          });
        }
        if (status === 429) {
          return res.status(429).json({
            code: "elevenlabs_rate_limited",
            message: "ElevenLabs is rate-limiting requests. Please try again in a minute.",
          });
        }
        if (status === 422 || status === 400) {
          return res.status(400).json({
            code: "elevenlabs_bad_prompt",
            message: "ElevenLabs couldn't process this prompt. Try rewording it.",
          });
        }
        return res.status(502).json({
          code: "elevenlabs_error",
          message: `ElevenLabs returned an error (status ${status}). Please try again.`,
        });
      }

      if (/api key/i.test(raw)) {
        return res.status(503).json({
          code: "missing_api_key",
          message: "Sound generation isn't configured on the server (missing API key).",
        });
      }

      res.status(500).json({
        code: "generation_failed",
        message: "Failed to generate soundscape. Please try again.",
        detail: raw,
      });
    }
  });

  // Adopt a guest's locally-tracked soundscapes once they sign in. The
  // client sends the IDs it had been remembering in localStorage; the
  // server claims any rows that still exist, are private, and have no
  // owner yet, and best-effort updates the underlying audio object's ACL
  // so the new owner can stream it via the /objects/* route.
  app.post("/api/soundscapes/adopt", isAuthenticated, async (req, res) => {
    const adoptRequestSchema = z.object({
      ids: z.array(z.string().min(1).max(256)).max(100),
    });

    let validated: z.infer<typeof adoptRequestSchema>;
    try {
      validated = adoptRequestSchema.parse(req.body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          code: "invalid_request",
          message: "Invalid request data",
          errors: error.errors,
        });
      }
      throw error;
    }

    const ownerId = (req.user as any)?.claims?.sub;
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // De-duplicate to keep the SQL update predictable.
    const uniqueIds = Array.from(new Set(validated.ids));
    if (uniqueIds.length === 0) {
      return res.json({ adopted: [] });
    }

    try {
      // Pre-flight: figure out which IDs are *actually* adoptable (exist,
      // private, currently ownerless). We do this so we can rewrite each
      // audio object's ACL FIRST, and only then update DB ownership for
      // the rows whose ACL update succeeded. That guarantees we never end
      // up with a row owned by the user that they can't actually stream.
      const candidates = await storage.getOrphanSoundscapesByIds(uniqueIds);
      if (candidates.length === 0) {
        return res.json({ adopted: [] });
      }

      const objectStorage = new ObjectStorageService();
      let privateDir: string | null = null;
      try {
        privateDir = objectStorage.getPrivateObjectDir();
        if (!privateDir.endsWith("/")) privateDir = `${privateDir}/`;
      } catch (err) {
        console.warn(
          "Object storage not configured; cannot adopt soundscapes that need ACL updates.",
          err,
        );
        privateDir = null;
      }

      // For each candidate, attempt the ACL rewrite. Only IDs whose ACL
      // is now safely owned by the new user are passed on to the DB
      // claim step. Rows whose audio file is missing on object storage
      // are also claimable — there's no ACL to break, and the row's
      // metadata is still worth carrying over so the user can clean it
      // up themselves. Anything that fails is left as an orphan so the
      // next sign-in attempt (which the client will keep retrying via
      // localStorage) can try again.
      const claimableIds: string[] = [];
      const aclFailedIds: string[] = [];
      for (const row of candidates) {
        if (!row.audioUrl?.startsWith("/objects/")) {
          // No private object backing this row — nothing to ACL.
          claimableIds.push(row.id);
          continue;
        }
        if (!privateDir) {
          aclFailedIds.push(row.id);
          continue;
        }
        try {
          const entityId = row.audioUrl.slice("/objects/".length);
          const fullPath = `${privateDir}${entityId}`;
          const stripped = fullPath.startsWith("/") ? fullPath.slice(1) : fullPath;
          const slash = stripped.indexOf("/");
          const bucketName = stripped.slice(0, slash);
          const objectName = stripped.slice(slash + 1);
          const file = objectStorageClient.bucket(bucketName).file(objectName);
          const [exists] = await file.exists();
          if (!exists) {
            // The audio is gone, but the metadata row is still safe to
            // carry over — it just won't play, same as any other row
            // with a missing file (handled by reportUnavailable on the
            // client).
            claimableIds.push(row.id);
            continue;
          }
          await setObjectAclPolicy(file, {
            owner: ownerId,
            visibility: "private",
          });
          claimableIds.push(row.id);
        } catch (err) {
          console.error(
            `Failed to update ACL for soundscape ${row.id} (${row.audioUrl}); leaving as orphan for retry:`,
            err,
          );
          aclFailedIds.push(row.id);
        }
      }

      const adopted = await storage.claimOrphanSoundscapesForOwner(claimableIds, ownerId);
      if (aclFailedIds.length > 0) {
        console.warn(
          `Adopt: ${aclFailedIds.length} soundscape(s) skipped due to ACL update failures: ${aclFailedIds.join(", ")}`,
        );
      }
      res.json({ adopted });
    } catch (error) {
      console.error("Failed to adopt soundscapes:", error);
      res.status(500).json({
        message: "Failed to adopt soundscapes",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/soundscapes/mine", isAuthenticated, async (req, res) => {
    try {
      const ownerId = (req.user as any)?.claims?.sub;
      if (!ownerId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const mine = await storage.getSoundscapesByOwner(ownerId);
      res.json({ soundscapes: mine });
    } catch (error) {
      console.error("Failed to get user soundscapes:", error);
      res.status(500).json({
        message: "Failed to get your soundscapes",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.delete("/api/soundscapes/:id", isAuthenticated, async (req, res) => {
    try {
      const ownerId = (req.user as any)?.claims?.sub;
      if (!ownerId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { id } = req.params;
      const existing = await storage.getSoundscape(id);
      if (!existing || existing.ownerId !== ownerId) {
        // Don't reveal whether it exists for another user.
        return res.status(404).json({ message: "Soundscape not found" });
      }

      const deleted = await storage.deleteSoundscapeForOwner(id, ownerId);
      if (!deleted) {
        return res.status(404).json({ message: "Soundscape not found" });
      }

      // Best-effort: remove the underlying audio object from object storage.
      // Failures here are logged but do not fail the request — the row is
      // already gone and orphaned objects can be cleaned up separately.
      const audioUrl = deleted.audioUrl;
      if (audioUrl && audioUrl.startsWith("/objects/")) {
        try {
          const objectStorage = new ObjectStorageService();
          const objectFile = await objectStorage.getObjectEntityFile(audioUrl);
          await objectFile.delete({ ignoreNotFound: true });
        } catch (cleanupError) {
          if (!(cleanupError instanceof ObjectNotFoundError)) {
            console.error("Failed to delete soundscape audio object:", cleanupError);
          }
        }
      }

      res.json({ success: true, id });
    } catch (error) {
      console.error("Failed to delete soundscape:", error);
      res.status(500).json({
        message: "Failed to delete soundscape",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/soundscapes/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const soundscape = await storage.getSoundscape(id);

      if (!soundscape) {
        res.status(404).json({ message: "Soundscape not found" });
        return;
      }

      // Access control: public soundscapes are readable by anyone; private
      // (per-user) soundscapes are only readable by their owner.
      if (!soundscape.isPublic) {
        const userId = (req as any).user?.claims?.sub as string | undefined;
        if (!userId || soundscape.ownerId !== userId) {
          res.status(404).json({ message: "Soundscape not found" });
          return;
        }
      }

      res.json(soundscape);
    } catch (error) {
      console.error("Failed to get soundscape:", error);
      res.status(500).json({ 
        message: "Failed to get soundscape",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // The legacy /api/sessions endpoints have been removed. They were
  // unauthenticated and unscoped: GET returned the entire pomodoro_sessions
  // table to any caller, and POST let any caller insert arbitrary rows.
  // Nothing in the current frontend uses them, so we respond 410 Gone so
  // any stale clients fail loudly instead of silently regressing back to
  // a public read/write surface on production data.
  app.all("/api/sessions", (_req, res) => {
    res.status(410).json({
      message:
        "This endpoint has been removed. Pomodoro session history is no longer exposed via a public API.",
    });
  });

  // The legacy GET /api/audio/:filename endpoint that served MP3s out of the
  // ephemeral attached_assets/ directory has been removed. Saved soundscapes
  // are now served from object storage via /objects/...; we respond 410 Gone
  // so any stale clients fail loudly instead of silently regressing back to
  // writing into the ephemeral folder.
  app.all("/api/audio/:filename", (_req, res) => {
    res.status(410).json({
      message: "This endpoint has been removed. Soundscape audio is now served from /objects/...",
    });
  });

  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      elevenlabs: getElevenLabsHealth(),
    });
  });

  // On-demand re-check of the ElevenLabs key for any signed-in user.
  // Returns the fresh status so an operator can verify a rotated key
  // without waiting for the next scheduled poll. Gated behind
  // isAuthenticated to keep anonymous traffic from triggering upstream
  // calls; rate-limited per-IP to prevent a logged-in user from hammering
  // ElevenLabs through this endpoint.
  app.post(
    "/api/health/elevenlabs/check",
    isAuthenticated,
    suggestionsRateLimiter.middleware(),
    async (_req, res) => {
      const health = await checkElevenLabsHealth();
      res.json(health);
    },
  );

  // Serve uploaded objects (used for AI-generated soundscape audio).
  // Enforces ACL: public objects are served to anyone; private objects
  // require an authenticated owner. We return 404 (not 403) to avoid
  // revealing whether a private path exists.
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const userId = (req as any).user?.claims?.sub as string | undefined;
      const allowed = await canAccessObject({
        objectFile,
        userId,
        requestedPermission: ObjectPermission.READ,
      });
      if (!allowed) {
        return res.status(404).json({ message: "Object not found" });
      }
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ message: "Object not found" });
      }
      console.error("Error serving object:", error);
      return res.status(500).json({ message: "Failed to serve object" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
