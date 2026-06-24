import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { ensurePresetAudiosUploaded } from "./preset_audio";
import { startElevenLabsHealthMonitor } from "./services/elevenlabs";
import { storage } from "./storage";

/**
 * Recursively removes any key named "prompt" from a plain-object/array tree
 * so that user-authored soundscape prompts are never written to request logs.
 */
function stripSensitiveFields(value: Record<string, unknown>): Record<string, unknown>;
function stripSensitiveFields(value: unknown[]): unknown[];
function stripSensitiveFields(value: Record<string, unknown> | unknown[]): Record<string, unknown> | unknown[] {
  if (Array.isArray(value)) {
    return value.map((item) =>
      item !== null && typeof item === "object"
        ? stripSensitiveFields(item as Record<string, unknown>)
        : item,
    );
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (key === "prompt") continue;
    const child = value[key];
    result[key] =
      child !== null && typeof child === "object"
        ? stripSensitiveFields(child as Record<string, unknown>)
        : child;
  }
  return result;
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

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
        const safeResponse = stripSensitiveFields(capturedJsonResponse);
        logLine += ` :: ${JSON.stringify(safeResponse)}`;
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

    // Kick off the heavy, one-time startup jobs in the background AFTER the
    // server is already listening, so deploy healthchecks (which hit "/")
    // pass immediately instead of failing for the duration of an O(N)
    // startup. Security is preserved: the /objects/* route awaits
    // storage.initialize() before serving any object, so ACL reconciliation
    // still gates anonymous access to private objects even though it no
    // longer blocks boot.
    storage.initialize()
      .then(() => {
        // Ensure all five preset MP3s (Rain, Coffee Shop, City Park, Distant
        // Thunder, Jazz Bar) are uploaded to durable object storage with a
        // public ACL so the quick-pick buttons keep working across container
        // rebuilds (where attached_assets/ may be wiped).
        return ensurePresetAudiosUploaded();
      })
      .catch((err) => {
        console.error("Background startup initialization failed:", err);
      });

    // Start the ElevenLabs key health monitor: pings /v1/user shortly after
    // startup and every 5 minutes, logging a greppable WARN
    // (`[elevenlabs-health] WARN: ...`) when the key is rejected or rate
    // limited so we notice before users do. When ELEVENLABS_ALERT_WEBHOOK_URL
    // is set, the monitor also POSTs a notification to that webhook on every
    // status flip (failure or recovery) so the team gets paged instead of
    // having to tail logs.
    startElevenLabsHealthMonitor();
  });
})();
