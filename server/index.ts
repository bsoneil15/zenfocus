import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { ensurePresetAudiosUploaded } from "./preset_audio";
import { startElevenLabsHealthMonitor } from "./services/elevenlabs";
import path from "path";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await setupAuth(app);
  registerAuthRoutes(app);
  const server = await registerRoutes(app);

  // Read-only static mount kept so any client path that still references
  // /attached_assets/... (e.g. old browser caches) doesn't 404 hard.
  // All five preset soundscapes (Rain, Coffee Shop, City Park, Distant
  // Thunder, Jazz Bar) are now uploaded to durable object storage at
  // startup and served via /objects/..., so this mount is purely a safety
  // net. The legacy GET /api/audio/:filename endpoint has been removed
  // (it now returns 410 Gone). Nothing writes to this directory at runtime.
  app.use(
    "/attached_assets",
    express.static(path.resolve(import.meta.dirname, "..", "attached_assets"))
  );

  // Fire-and-forget: ensure all five preset MP3s (Rain, Coffee Shop, City
  // Park, Distant Thunder, Jazz Bar) are uploaded to durable object storage
  // with public ACL so the quick-pick buttons keep working across container
  // rebuilds (where attached_assets/ may be wiped).
  ensurePresetAudiosUploaded().catch((err) => {
    console.error("Failed to ensure preset audios in object storage:", err);
  });

  // Start the ElevenLabs key health monitor: pings /v1/user shortly after
  // startup and every 5 minutes, logging a greppable WARN
  // (`[elevenlabs-health] WARN: ...`) when the key is rejected or rate
  // limited so we notice before users do.
  startElevenLabsHealthMonitor();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error(err);
    if (res.headersSent) return;
    res.status(status).json({ message });
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
