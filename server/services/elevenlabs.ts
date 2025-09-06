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
  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  if (!apiKey) {
    throw new Error("ElevenLabs API key not found. Please set ELEVENLABS_API_KEY environment variable.");
  }

  console.log("Generating sound with ElevenLabs:", { prompt: request.prompt, duration: request.duration });

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: request.prompt,
        duration_seconds: Math.min(request.duration, 22),
        prompt_influence: request.promptInfluence || 0.7,
        looping: request.looping || false,
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
          duration: request.duration,
        };
      } else {
        throw new Error("Unexpected JSON response from ElevenLabs API");
      }
    } else {
      // If audio data, save to file system and return local URL
      const audioBuffer = await response.arrayBuffer();
      
      // Create a filename based on timestamp and prompt
      const filename = `soundscape_${Date.now()}.mp3`;
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Save to the client's public audio directory
      const audioPath = path.join(process.cwd(), 'client', 'public', 'audio', filename);
      await fs.writeFile(audioPath, Buffer.from(audioBuffer));
      
      return {
        audioUrl: `/audio/${filename}`,
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
