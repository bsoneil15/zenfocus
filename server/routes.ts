import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertSoundscapeSchema } from "@shared/schema";
import { isAuthenticated } from "./replit_integrations/auth";
import { generateFocusPrompts, generateSoundscapeName } from "./services/openai";
import { generateSound } from "./services/elevenlabs";
import { soundscapeRateLimiter, suggestionsRateLimiter } from "./middleware/rate-limiter";
import {
  canGenerate as canGenerateDaily,
  incrementDailyUsage as incrementDailyUsageServer,
  getDailyUsage as getDailyUsageServer,
  DAILY_SOUNDSCAPE_LIMIT,
} from "./services/daily-limits";
import {
  ObjectStorageService,
  ObjectNotFoundError,
  ObjectPermission,
  canAccessObject,
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

  app.get("/api/soundscapes/daily-limit", (req, res) => {
    const usage = getDailyUsageServer(req);
    res.json(usage);
  });

  app.get("/api/soundscapes/suggestions", suggestionsRateLimiter.middleware(), async (req, res) => {
    try {
      const suggestions = await generateFocusPrompts();
      res.json({ suggestions });
    } catch (error) {
      console.error("Failed to generate suggestions:", error);
      res.status(500).json({ 
        message: "Failed to generate suggestions",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

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

  app.post("/api/soundscapes/generate", soundscapeRateLimiter.middleware(), async (req, res) => {
    try {
      if (!canGenerateDaily(req)) {
        const usage = getDailyUsageServer(req);
        return res.status(429).json({
          code: "daily_limit_reached",
          message: `You've reached your daily limit of ${DAILY_SOUNDSCAPE_LIMIT} custom soundscapes. Try again tomorrow!`,
          ...usage,
        });
      }

      const generateRequestSchema = z.object({
        prompt: z.string().min(1).max(500),
        duration: z.number().min(21).max(21).default(21),
        looping: z.boolean().default(true),
        promptInfluence: z.number().min(0).max(1).default(0.7),
      });

      const validatedData = generateRequestSchema.parse(req.body);

      const soundResult = await generateSound({
        prompt: validatedData.prompt,
        duration: validatedData.duration,
        looping: validatedData.looping,
        promptInfluence: validatedData.promptInfluence,
      });

      console.log("About to call generateSoundscapeName with prompt:", validatedData.prompt);
      let name;
      try {
        name = await generateSoundscapeName(validatedData.prompt);
        console.log("Received name from generateSoundscapeName:", name);
      } catch (nameError) {
        console.error("Error in generateSoundscapeName:", nameError);
        name = "Custom Soundscape";
      }

      const ownerId = (req.user as any)?.claims?.sub ?? null;

      const dailyUsage = incrementDailyUsageServer(req);

      const soundscape = await storage.createSoundscape({
        name,
        prompt: validatedData.prompt,
        audioUrl: soundResult.audioUrl,
        duration: soundResult.duration,
        isPublic: false,
        ownerId,
      });

      res.json({
        id: soundscape.id,
        name: soundscape.name,
        audioUrl: soundscape.audioUrl,
        prompt: soundscape.prompt,
        duration: soundscape.duration,
        dailyUsage,
      });
    } catch (error) {
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

  app.post("/api/sessions", async (req, res) => {
    try {
      const sessionSchema = z.object({
        duration: z.number().min(1),
        isBreak: z.boolean().default(false),
        completed: z.boolean().default(false),
        soundscapeId: z.string().optional(),
      });

      const validatedData = sessionSchema.parse(req.body);
      const session = await storage.createPomodoroSession(validatedData);
      
      res.json(session);
    } catch (error) {
      console.error("Failed to create session:", error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          message: "Invalid request data",
          errors: error.errors 
        });
      } else {
        res.status(500).json({ 
          message: "Failed to create session",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  });

  app.get("/api/sessions", async (req, res) => {
    try {
      const sessions = await storage.getPomodoroSessions();
      res.json({ sessions });
    } catch (error) {
      console.error("Failed to get sessions:", error);
      res.status(500).json({ 
        message: "Failed to get sessions",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/audio/:filename", (req, res) => {
    try {
      const filename = decodeURIComponent(req.params.filename);
      const filePath = path.resolve(import.meta.dirname, '..', 'attached_assets', filename);
      
      console.log('Audio file request:', {
        originalParam: req.params.filename,
        decodedFilename: filename,
        resolvedPath: filePath
      });
      
      const assetsPath = path.resolve(import.meta.dirname, '..', 'attached_assets');
      if (!filePath.startsWith(assetsPath)) {
        console.error('Security violation: attempted to access file outside assets:', filename);
        return res.status(403).json({ message: 'Access denied' });
      }
      
      if (!fs.existsSync(filePath)) {
        console.error('Audio file not found:', filename, 'at path:', filePath);
        return res.status(404).json({ message: 'Audio file not found', filename });
      }
      
      res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Pragma, Expires',
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000',
        'Access-Control-Max-Age': '3600'
      });
      
      res.sendFile(filePath, (err) => {
        if (err) {
          console.error('Error serving audio file:', err);
          if (!res.headersSent) {
            res.status((err as any).status || 500).end();
          }
        }
      });
    } catch (error) {
      console.error('Unexpected error in audio endpoint:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Internal server error' });
      }
    }
  });
  
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

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
