import { z } from "zod";

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
      
      // If audio data, save to file system and return local URL
      const audioBuffer = await response.arrayBuffer();
      
      // Verify the buffer is not empty
      if (audioBuffer.byteLength === 0) {
        throw new Error("Received empty audio buffer from ElevenLabs API");
      }
      
      // Create a filename based on timestamp and prompt
      const filename = `soundscape_${Date.now()}.mp3`;
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Save to the attached_assets directory (where audio files are served from)
      const audioPath = path.join(process.cwd(), 'attached_assets', filename);
      
      try {
        await fs.writeFile(audioPath, Buffer.from(audioBuffer));
        console.log(`Successfully saved audio file: ${filename} (${audioBuffer.byteLength} bytes)`);
      } catch (writeError) {
        console.error("Failed to write audio file:", writeError);
        throw new Error(`Failed to save audio file: ${writeError instanceof Error ? writeError.message : 'Unknown error'}`);
      }
      
      return {
        audioUrl: `/api/audio/${filename}`,
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
