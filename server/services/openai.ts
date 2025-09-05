import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY
});

export interface FocusPromptSuggestion {
  id: string;
  text: string;
  category: string;
}

export async function generateFocusPrompts(): Promise<FocusPromptSuggestion[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025
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

    return result.suggestions.map((suggestion: any, index: number) => ({
      id: suggestion.id || (index + 1).toString(),
      text: suggestion.text || "Gentle ambient soundscape for focus",
      category: suggestion.category || "ambient",
    }));
  } catch (error) {
    console.error("Failed to generate focus prompts:", error);
    
    // Fallback suggestions if OpenAI fails
    return [
      {
        id: "1",
        text: "Gentle forest ambience with distant birds and rustling leaves",
        category: "nature",
      },
      {
        id: "2", 
        text: "Soft ocean waves with subtle wind through beach grass",
        category: "nature",
      },
      {
        id: "3",
        text: "Cozy fireplace crackling with distant mountain wind",
        category: "ambient",
      },
    ];
  }
}

export async function generateSoundscapeName(prompt: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025
      messages: [
        {
          role: "system",
          content: `Create a short, catchy name (2-4 words) for a soundscape based on the given prompt. The name should be memorable and descriptive. Respond with JSON in this format: { "name": "Soundscape Name" }`
        },
        {
          role: "user",
          content: `Generate a name for this soundscape: "${prompt}"`
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 50,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result.name || "Custom Soundscape";
  } catch (error) {
    console.error("Failed to generate soundscape name:", error);
    // Generate a simple fallback name
    const words = prompt.split(' ').slice(0, 2);
    return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }
}
