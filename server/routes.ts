import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import path from "path";
import { storage } from "./storage";
import { insertSoundscapeSchema } from "@shared/schema";
import { generateFocusPrompts, generateSoundscapeName } from "./services/openai";
import { generateSound } from "./services/elevenlabs";
import { soundscapeRateLimiter, suggestionsRateLimiter } from "./middleware/rate-limiter";

export async function registerRoutes(app: Express): Promise<Server> {
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
    const filename = req.params.filename;
    const filePath = path.resolve(import.meta.dirname, '..', 'attached_assets', filename);
    
    // Security check - ensure file is in attached_assets directory
    if (!filePath.startsWith(path.resolve(import.meta.dirname, '..', 'attached_assets'))) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('Error serving audio file:', err);
        res.status(404).json({ message: 'Audio file not found' });
      }
    });
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
