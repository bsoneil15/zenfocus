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

export async function generateSound(request: SoundGenerationRequest): Promise<SoundGenerationResponse> {
  const apiKey = process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY_ENV_VAR || "default_key";
  
  if (!apiKey || apiKey === "default_key") {
    throw new Error("ElevenLabs API key not found. Please set ELEVENLABS_API_KEY environment variable.");
  }

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: request.prompt,
        duration_seconds: request.duration,
        prompt_influence: request.promptInfluence || 0.7,
        looping: request.looping || false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    // Check if response is JSON or audio
    const contentType = response.headers.get("content-type");
    
    if (contentType?.includes("application/json")) {
      // If JSON, it might be a job ID for async processing
      const jsonResponse = await response.json();
      
      if (jsonResponse.audio_url) {
        return {
          audioUrl: jsonResponse.audio_url,
          duration: request.duration,
        };
      } else {
        throw new Error("Unexpected JSON response from ElevenLabs API");
      }
    } else {
      // If audio data, convert to blob and create URL
      const audioBlob = await response.blob();
      
      // In a real production environment, you would:
      // 1. Save the blob to a file storage service (AWS S3, Cloudinary, etc.)
      // 2. Return the permanent URL
      // For this demo, we'll create a temporary blob URL
      const audioUrl = URL.createObjectURL(audioBlob);
      
      return {
        audioUrl,
        duration: request.duration,
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
