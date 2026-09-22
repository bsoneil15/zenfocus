import OpenAI from "openai";
import { z } from "zod";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY
});

export interface FocusPromptSuggestion {
  id: string;
  text: string;
  category: string;
}

const suggestionSchema = z.object({
  id: z.string(),
  text: z.string().min(1, "Suggestion text cannot be empty"),
  category: z.string().min(1, "Category cannot be empty"),
});

const suggestionsResponseSchema = z.object({
  suggestions: z.array(suggestionSchema),
});

export async function generateFocusPrompts(): Promise<FocusPromptSuggestion[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert in creating ambient soundscapes for focus and productivity. Generate 3 creative and diverse prompts for AI sound generation that would help someone focus during a Pomodoro session. Each prompt should be 50-80 characters long and describe a peaceful, non-distracting ambient soundscape. Respond with JSON in this format: { "suggestions": [{"id": "1", "text": "prompt text", "category": "nature/urban/abstract"}] }`
        },
        {
          role: "user",
          content: "Generate 3 diverse focus soundscape prompts for productivity sessions."
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 300,
    });

    const content = response.choices[0].message.content || "{}";
    let result;
    
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", content);
      throw new Error("Invalid JSON response from OpenAI");
    }
    
    if (!result.suggestions || !Array.isArray(result.suggestions)) {
      console.log("OpenAI response missing suggestions:", result);
      throw new Error("Invalid response format from OpenAI");
    }

    // Validate the response structure
    try {
      const validatedResponse = suggestionsResponseSchema.parse(result);
      return validatedResponse.suggestions;
    } catch (validationError) {
      console.error("OpenAI response validation failed:", validationError);
      
      // Try to salvage partial data with defaults
      const salvaged = result.suggestions
        .map((suggestion: any, index: number) => {
          try {
            return suggestionSchema.parse({
              id: suggestion.id || (index + 1).toString(),
              text: suggestion.text || "Gentle ambient soundscape for focus",
              category: suggestion.category || "ambient",
            });
          } catch {
            return null;
          }
        })
        .filter((s: any) => s !== null);
      
      if (salvaged.length > 0) {
        console.log(`Salvaged ${salvaged.length} valid suggestions from malformed response`);
        return salvaged as FocusPromptSuggestion[];
      }
      
      throw new Error("Could not validate any suggestions from OpenAI response");
    }
  } catch (error) {
    console.error("Failed to generate focus prompts:", error);
    // Re-throw so the route can refund the daily suggestions slot.
    // Returning hardcoded fallbacks here previously consumed quota on every
    // OpenAI failure (and every panel open) while the user still only saw
    // static copy. The client already has its own offline fallbacks.
    throw error instanceof Error
      ? error
      : new Error("Failed to generate focus prompts");
  }
}

export async function generateSoundscapeName(prompt: string): Promise<string> {
  // For now, let's use our reliable fallback system since OpenAI is having issues
  // Generate a simple fallback name with emoji
  const words = prompt.split(' ').slice(0, 2);
  const name = words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  
  // Add appropriate emoji based on keywords in prompt
  const lowerPrompt = prompt.toLowerCase();
  let emoji = "🎵"; // default
  if (lowerPrompt.includes('rain') || lowerPrompt.includes('storm') || lowerPrompt.includes('thunder')) emoji = "🌧️";
  else if (lowerPrompt.includes('ocean') || lowerPrompt.includes('wave') || lowerPrompt.includes('water') || lowerPrompt.includes('sea')) emoji = "🌊";
  else if (lowerPrompt.includes('fire') || lowerPrompt.includes('crackling') || lowerPrompt.includes('hearth') || lowerPrompt.includes('fireplace')) emoji = "🔥";
  else if (lowerPrompt.includes('forest') || lowerPrompt.includes('bird') || lowerPrompt.includes('tree') || lowerPrompt.includes('chirping')) emoji = "🌳";
  else if (lowerPrompt.includes('wind') || lowerPrompt.includes('breeze') || lowerPrompt.includes('air')) emoji = "🌬️";
  else if (lowerPrompt.includes('coffee') || lowerPrompt.includes('cafe') || lowerPrompt.includes('shop')) emoji = "☕";
  else if (lowerPrompt.includes('night') || lowerPrompt.includes('evening') || lowerPrompt.includes('moon')) emoji = "🌙";
  else if (lowerPrompt.includes('city') || lowerPrompt.includes('urban') || lowerPrompt.includes('street')) emoji = "🏙️";
  else if (lowerPrompt.includes('mountain') || lowerPrompt.includes('stream') || lowerPrompt.includes('river')) emoji = "🏔️";
  else if (lowerPrompt.includes('beach') || lowerPrompt.includes('grass') || lowerPrompt.includes('nature')) emoji = "🌾";
  
  const generatedName = `${emoji} ${name}`;
  return generatedName;
}
