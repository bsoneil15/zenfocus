import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import path from "path";
import fs from "fs";
import passport from "passport";
import { storage } from "./storage";
import { insertUserSchema, insertSoundscapeSchema } from "@shared/schema";
import { hashPassword } from "./auth";
import { generateFocusPrompts, generateSoundscapeName } from "./services/openai";
import { generateSound } from "./services/elevenlabs";
import { soundscapeRateLimiter, suggestionsRateLimiter } from "./middleware/rate-limiter";

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: "Not authenticated" });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth routes
  app.post("/api/register", async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
      const existing = await storage.getUserByUsername(data.username);
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }
      const user = await storage.createUser({
        username: data.username,
        password: await hashPassword(data.password),
      });
      req.login(user, (err) => {
        if (err) return res.status(500).json({ message: "Login failed after registration" });
        const { password: _, ...safeUser } = user;
        res.status(201).json(safeUser);
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials" });
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        const { password: _, ...safeUser } = user;
        res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  // Rate limit status endpoint
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

  // Get focus prompt suggestions from OpenAI
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

  // Get all soundscapes
  app.get("/api/soundscapes", async (req, res) => {
    try {
      const soundscapes = await storage.getSoundscapes();
      res.json({ soundscapes });
    } catch (error) {
      console.error("Failed to get soundscapes:", error);
      res.status(500).json({ 
        message: "Failed to get soundscapes",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Generate a new soundscape using ElevenLabs
  app.post("/api/soundscapes/generate", soundscapeRateLimiter.middleware(), async (req, res) => {
    try {
      const generateRequestSchema = z.object({
        prompt: z.string().min(1).max(500),
        duration: z.number().min(21).max(21).default(21),
        looping: z.boolean().default(true),
        promptInfluence: z.number().min(0).max(1).default(0.7),
      });

      const validatedData = generateRequestSchema.parse(req.body);

      // Generate the sound using ElevenLabs
      const soundResult = await generateSound({
        prompt: validatedData.prompt,
        duration: validatedData.duration,
        looping: validatedData.looping,
        promptInfluence: validatedData.promptInfluence,
      });

      // Generate a name for the soundscape using OpenAI
      console.log("About to call generateSoundscapeName with prompt:", validatedData.prompt);
      let name;
      try {
        name = await generateSoundscapeName(validatedData.prompt);
        console.log("Received name from generateSoundscapeName:", name);
      } catch (nameError) {
        console.error("Error in generateSoundscapeName:", nameError);
        name = "🎵 Custom Soundscape";
      }

      // Store the soundscape in our storage
      const soundscape = await storage.createSoundscape({
        name,
        prompt: validatedData.prompt,
        audioUrl: soundResult.audioUrl,
        duration: soundResult.duration,
        isPublic: false,
      });

      res.json({
        id: soundscape.id,
        name: soundscape.name,
        audioUrl: soundscape.audioUrl,
        prompt: soundscape.prompt,
        duration: soundscape.duration,
      });
    } catch (error) {
      console.error("Failed to generate soundscape:", error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          message: "Invalid request data",
          errors: error.errors 
        });
      } else {
        res.status(500).json({ 
          message: "Failed to generate soundscape",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  });

  // Get a specific soundscape
  app.get("/api/soundscapes/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const soundscape = await storage.getSoundscape(id);
      
      if (!soundscape) {
        res.status(404).json({ message: "Soundscape not found" });
        return;
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

  // Create a pomodoro session record
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

  // Get all pomodoro sessions
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

  // Newsletter signup endpoint
  app.post("/api/newsletter/signup", async (req, res) => {
    try {
      const signupSchema = z.object({
        email: z.string().email("Invalid email address"),
      });

      const validatedData = signupSchema.parse(req.body);
      
      // Check if already subscribed
      const existing = await storage.getNewsletterSubscriber(validatedData.email);
      if (existing) {
        res.status(200).json({ 
          message: "Already subscribed!",
          alreadySubscribed: true 
        });
        return;
      }

      // Create new subscriber
      const subscriber = await storage.createNewsletterSubscriber({
        email: validatedData.email,
        subscribed: true,
      });

      // Unlock all newsletter soundscape packs
      const packs = await storage.getSoundscapePacks();
      const newsletterPacks = packs.filter(pack => pack.unlockedBy === "newsletter");
      
      for (const pack of newsletterPacks) {
        await storage.updateSoundscapePackUnlocked(pack.id, true);
      }

      res.json({
        message: "Successfully subscribed to newsletter!",
        subscriber: { email: subscriber.email },
        unlockedPacks: newsletterPacks.length
      });
    } catch (error) {
      console.error("Failed to subscribe to newsletter:", error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          message: "Invalid email address",
          errors: error.errors 
        });
      } else {
        res.status(500).json({ 
          message: "Failed to subscribe to newsletter",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  });

  // Get soundscape packs
  app.get("/api/soundscape-packs", async (req, res) => {
    try {
      const packs = await storage.getSoundscapePacks();
      res.json({ packs });
    } catch (error) {
      console.error("Failed to get soundscape packs:", error);
      res.status(500).json({ 
        message: "Failed to get soundscape packs",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Serve audio files
  app.get("/api/audio/:filename", (req, res) => {
    try {
      const filename = decodeURIComponent(req.params.filename);
      const filePath = path.resolve(import.meta.dirname, '..', 'attached_assets', filename);
      
      console.log('Audio file request:', {
        originalParam: req.params.filename,
        decodedFilename: filename,
        resolvedPath: filePath
      });
      
      // Security check - ensure file is in attached_assets directory
      const assetsPath = path.resolve(import.meta.dirname, '..', 'attached_assets');
      if (!filePath.startsWith(assetsPath)) {
        console.error('Security violation: attempted to access file outside assets:', filename);
        return res.status(403).json({ message: 'Access denied' });
      }
      
      // Check if file exists first
      if (!fs.existsSync(filePath)) {
        console.error('Audio file not found:', filename, 'at path:', filePath);
        return res.status(404).json({ message: 'Audio file not found', filename });
      }
      
      // Set proper headers for audio files
      res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Pragma, Expires',
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
        'Access-Control-Max-Age': '3600'
      });
      
      // Send file with error handling
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
  
  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
