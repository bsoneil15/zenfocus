import { z } from "zod";
import { randomUUID } from "crypto";
import {
  ObjectStorageService,
  objectStorageClient,
  setObjectAclPolicy,
} from "../replit_integrations/object_storage";

export interface SoundGenerationRequest {
  prompt: string;
  duration: number;
  looping?: boolean;
  promptInfluence?: number;
}

export interface SoundGenerationResponse {
  audioUrl: string;
  duration: number;
}

const soundGenerationRequestSchema = z.object({
  prompt: z.string().min(1, "Prompt cannot be empty").max(500, "Prompt too long"),
  duration: z.number().min(1, "Duration must be at least 1 second").max(22, "Duration cannot exceed 22 seconds"),
  looping: z.boolean().optional(),
  promptInfluence: z.number().min(0, "Prompt influence must be between 0 and 1").max(1, "Prompt influence must be between 0 and 1").optional(),
});

export async function generateSound(request: SoundGenerationRequest): Promise<SoundGenerationResponse> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  if (!apiKey) {
    throw new Error("ElevenLabs API key not found. Please set ELEVENLABS_API_KEY environment variable.");
  }

  const validatedRequest = soundGenerationRequestSchema.parse(request);

  console.log("Generating sound with ElevenLabs:", { prompt: validatedRequest.prompt, duration: validatedRequest.duration });

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: validatedRequest.prompt,
        duration_seconds: validatedRequest.duration,
        prompt_influence: validatedRequest.promptInfluence || 0.7,
        looping: validatedRequest.looping || false,
      }),
    });

    console.log("ElevenLabs API response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API error response:", errorText);
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    // Check if response is JSON or audio
    const contentType = response.headers.get("content-type");
    console.log("Response content type:", contentType);
    
    if (contentType?.includes("application/json")) {
      // If JSON, it might be a job ID for async processing
      const jsonResponse = await response.json();
      console.log("JSON response from ElevenLabs:", jsonResponse);
      
      if (jsonResponse.audio_url) {
        return {
          audioUrl: jsonResponse.audio_url,
          duration: validatedRequest.duration,
        };
      } else {
        throw new Error("Unexpected JSON response from ElevenLabs API");
      }
    } else {
      // Validate that the response is actually audio data
      const validAudioTypes = ['audio/', 'application/octet-stream'];
      const isValidAudio = validAudioTypes.some(type => contentType?.includes(type));
      
      if (!isValidAudio) {
        console.error("Invalid content type received from ElevenLabs:", contentType);
        throw new Error(`Expected audio data but received: ${contentType || 'unknown content type'}`);
      }
      
      // If audio data, upload to durable object storage and return a stable
      // path. Files used to be written to attached_assets/ which is wiped on
      // container rebuild — soundscape rows survived but audio was gone.
      const audioBuffer = await response.arrayBuffer();

      if (audioBuffer.byteLength === 0) {
        throw new Error("Received empty audio buffer from ElevenLabs API");
      }

      const objectId = `${Date.now()}_${randomUUID()}.mp3`;
      const objectStorage = new ObjectStorageService();
      let privateDir = objectStorage.getPrivateObjectDir();
      if (!privateDir.endsWith("/")) privateDir = `${privateDir}/`;
      const fullPath = `${privateDir}soundscapes/${objectId}`;

      // fullPath is /<bucketName>/<objectName>
      const stripped = fullPath.startsWith("/") ? fullPath.slice(1) : fullPath;
      const slash = stripped.indexOf("/");
      const bucketName = stripped.slice(0, slash);
      const objectName = stripped.slice(slash + 1);

      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      try {
        await file.save(Buffer.from(audioBuffer), {
          contentType: "audio/mpeg",
          resumable: false,
        });
        // Mark object public so the /objects/* serving route allows reads
        // without per-user ACL checks.
        await setObjectAclPolicy(file, {
          owner: "system",
          visibility: "public",
        });
        console.log(
          `Saved soundscape to object storage: soundscapes/${objectId} (${audioBuffer.byteLength} bytes)`
        );
      } catch (uploadError) {
        console.error("Failed to upload audio to object storage:", uploadError);
        throw new Error(
          `Failed to save audio: ${
            uploadError instanceof Error ? uploadError.message : "Unknown error"
          }`
        );
      }

      return {
        audioUrl: `/objects/soundscapes/${objectId}`,
        duration: validatedRequest.duration,
      };
    }
  } catch (error) {
    console.error("ElevenLabs sound generation failed:", error);
    throw new Error(`Sound generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function validateApiKey(): Promise<boolean> {
  const apiKey = process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY_ENV_VAR;
  
  if (!apiKey || apiKey === "default_key") {
    return false;
  }

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: {
        "xi-api-key": apiKey,
      },
    });

    return response.ok;
  } catch (error) {
    console.error("Failed to validate ElevenLabs API key:", error);
    return false;
  }
}

// ----- ElevenLabs key health monitor -------------------------------------
// Pings the ElevenLabs /v1/user endpoint on startup and on a recurring
// interval so that an invalid / rate-limited key surfaces in server logs
// (greppable prefix: `[elevenlabs-health]`) before users hit it via a
// failed generation. Status is also exposed through /api/health.

export type ElevenLabsHealthStatus = "ok" | "missing_key" | "unauthorized" | "rate_limited" | "unreachable" | "unknown";

export interface ElevenLabsHealth {
  status: ElevenLabsHealthStatus;
  httpStatus: number | null;
  message: string;
  lastCheckedAt: string | null;
  lastOkAt: string | null;
}

let currentHealth: ElevenLabsHealth = {
  status: "unknown",
  httpStatus: null,
  message: "Health check has not run yet",
  lastCheckedAt: null,
  lastOkAt: null,
};

let healthInterval: NodeJS.Timeout | null = null;
// Re-warn at most once per hour while still unhealthy so an ongoing
// outage stays visible in logs without spamming every poll cycle.
const REWARN_INTERVAL_MS = 60 * 60 * 1000;
let lastWarnLoggedAt = 0;

export function getElevenLabsHealth(): ElevenLabsHealth {
  return { ...currentHealth };
}

export async function checkElevenLabsHealth(): Promise<ElevenLabsHealth> {
  const apiKey = process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY_ENV_VAR;
  const checkedAt = new Date().toISOString();
  const previousStatus = currentHealth.status;

  if (!apiKey || apiKey === "default_key") {
    currentHealth = {
      status: "missing_key",
      httpStatus: null,
      message: "ELEVENLABS_API_KEY is not set",
      lastCheckedAt: checkedAt,
      lastOkAt: currentHealth.lastOkAt,
    };
    maybeLogWarn(previousStatus, "missing_key", "ELEVENLABS_API_KEY is not set; sound generation will fail");
    return getElevenLabsHealth();
  }

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": apiKey },
    });

    if (response.ok) {
      currentHealth = {
        status: "ok",
        httpStatus: response.status,
        message: "ElevenLabs API key is valid",
        lastCheckedAt: checkedAt,
        lastOkAt: checkedAt,
      };
      if (previousStatus !== "ok" && previousStatus !== "unknown") {
        console.log("[elevenlabs-health] recovered: ElevenLabs API key is valid again");
      }
      lastWarnLoggedAt = 0;
      return getElevenLabsHealth();
    }

    let status: ElevenLabsHealthStatus;
    let message: string;
    if (response.status === 401 || response.status === 403) {
      status = "unauthorized";
      message = `ElevenLabs rejected the API key (HTTP ${response.status}). Rotate ELEVENLABS_API_KEY.`;
    } else if (response.status === 429) {
      status = "rate_limited";
      message = `ElevenLabs is rate-limiting this key (HTTP 429). Generation will fail until quota resets.`;
    } else {
      status = "unreachable";
      message = `ElevenLabs /v1/user returned HTTP ${response.status}`;
    }

    currentHealth = {
      status,
      httpStatus: response.status,
      message,
      lastCheckedAt: checkedAt,
      lastOkAt: currentHealth.lastOkAt,
    };
    maybeLogWarn(previousStatus, status, message);
    return getElevenLabsHealth();
  } catch (error) {
    const message = `Failed to reach ElevenLabs: ${error instanceof Error ? error.message : "unknown error"}`;
    currentHealth = {
      status: "unreachable",
      httpStatus: null,
      message,
      lastCheckedAt: checkedAt,
      lastOkAt: currentHealth.lastOkAt,
    };
    maybeLogWarn(previousStatus, "unreachable", message);
    return getElevenLabsHealth();
  }
}

// Logs a WARN on every status transition into an unhealthy state, and at
// most once per REWARN_INTERVAL_MS while the unhealthy state persists, so
// long-running outages stay visible without flooding the logs every poll.
function maybeLogWarn(
  previousStatus: ElevenLabsHealthStatus,
  newStatus: ElevenLabsHealthStatus,
  message: string,
): void {
  const now = Date.now();
  const transitioned = previousStatus !== newStatus;
  if (transitioned || now - lastWarnLoggedAt >= REWARN_INTERVAL_MS) {
    console.warn(`[elevenlabs-health] WARN: ${message}`);
    lastWarnLoggedAt = now;
  }
}

export function startElevenLabsHealthMonitor(intervalMs: number = 5 * 60 * 1000): void {
  if (healthInterval) return;
  // Run an initial check shortly after startup so we don't block server boot.
  setTimeout(() => {
    checkElevenLabsHealth().catch((err) => {
      console.error("[elevenlabs-health] initial check threw:", err);
    });
  }, 2000);
  healthInterval = setInterval(() => {
    checkElevenLabsHealth().catch((err) => {
      console.error("[elevenlabs-health] scheduled check threw:", err);
    });
  }, intervalMs);
  // Don't keep the process alive solely for this timer.
  if (typeof healthInterval.unref === "function") healthInterval.unref();
}
