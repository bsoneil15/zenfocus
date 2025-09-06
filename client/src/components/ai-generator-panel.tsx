import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { canGenerateToday, incrementDailyUsage, getRemainingGenerations } from "@/lib/daily-limits";

interface AIGeneratorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSoundscapeGenerated: (soundscape: { id: string; name: string; audioUrl: string; prompt: string }) => void;
}

interface PromptSuggestion {
  id: string;
  text: string;
}

export function AIGeneratorPanel({ 
  isOpen, 
  onClose, 
  onSoundscapeGenerated 
}: AIGeneratorPanelProps) {
  const [customPrompt, setCustomPrompt] = useState("");
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const { toast } = useToast();
  
  const remainingGenerations = getRemainingGenerations();
  const canGenerate = canGenerateToday();

  const loadSuggestions = async () => {
    if (suggestions.length > 0) return; // Already loaded
    
    setIsLoadingSuggestions(true);
    try {
      const response = await apiRequest("GET", "/api/soundscapes/suggestions");
      const data = await response.json();
      setSuggestions(data.suggestions);
    } catch (error) {
      console.error("Failed to load suggestions:", error);
      // Fallback suggestions
      setSuggestions([
        { id: "1", text: "Gentle forest ambience with distant birds and rustling leaves" },
        { id: "2", text: "Soft ocean waves with subtle wind through beach grass" },
        { id: "3", text: "Cozy fireplace crackling with distant mountain wind" },
      ]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const selectPrompt = (suggestion: PromptSuggestion) => {
    setCustomPrompt(suggestion.text);
  };

  const generateSoundscape = async () => {
    if (!customPrompt.trim()) {
      toast({
        title: "Error",
        description: "Please enter a prompt or select a suggestion.",
        variant: "destructive",
      });
      return;
    }

    // Check daily limit
    if (!canGenerateToday()) {
      toast({
        title: "Daily Limit Reached",
        description: "You've reached your daily limit of 3 custom soundscapes. Try again tomorrow!",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    
    // Show "this may take a moment" toast
    const loadingToast = toast({
      title: "Generating soundscape...",
      description: "This may take a moment",
    });
    
    try {
      const response = await apiRequest("POST", "/api/soundscapes/generate", {
        prompt: customPrompt.trim(),
        duration: 21,
        looping: true,
      });
      
      const data = await response.json();
      
      // Increment daily usage count
      incrementDailyUsage();
      
      onSoundscapeGenerated({
        id: data.id,
        name: data.name,
        audioUrl: data.audioUrl,
        prompt: customPrompt.trim(),
      });
      
      const remaining = getRemainingGenerations();
      toast({
        title: "Success",
        description: remaining > 0 
          ? `Custom soundscape generated successfully! ${remaining} generations remaining today.`
          : "Custom soundscape generated successfully! Daily limit reached.",
      });
      
      setCustomPrompt("");
      onClose();
    } catch (error: any) {
      console.error("Failed to generate soundscape:", {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        status: error.status,
        response: error.response
      });
      
      // Handle rate limiting specifically
      if (error.status === 429 || (error.response && error.response.status === 429)) {
        let errorData;
        try {
          errorData = error.response ? await error.response.json() : error;
        } catch {
          errorData = { message: "Rate limit exceeded" };
        }
        
        const retryMinutes = errorData.retryAfter 
          ? Math.ceil(errorData.retryAfter / (60 * 1000))
          : 'a few';
        
        toast({
          title: "Rate Limit Exceeded",
          description: `Too many soundscape requests. You can make ${errorData.maxRequests || 5} per hour. Try again in ${retryMinutes} minute(s).`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to generate soundscape. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Load suggestions when panel opens
  if (isOpen && suggestions.length === 0 && !isLoadingSuggestions) {
    loadSuggestions();
  }

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" 
      data-testid="ai-generator-panel"
    >
      <div 
        className={`absolute bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-3xl p-4 sm:p-6 transform transition-transform duration-300 max-h-[90vh] overflow-y-auto ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-6" />
        
        <h2 className="text-base sm:text-lg font-semibold text-foreground mb-2">
          AI Soundscape Generator
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground mb-2">
          Generate custom focus soundscapes using AI
        </p>
        <div className="flex items-center justify-center mb-4 sm:mb-6">
          <div className={`text-xs px-3 py-1 rounded-full text-center ${
            canGenerate ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
          }`}>
            {remainingGenerations > 0 
              ? `${remainingGenerations} generations remaining today`
              : 'Daily limit reached (resets tomorrow)'
            }
          </div>
        </div>
        
        <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
          <h3 className="text-xs sm:text-sm font-medium text-foreground">
            Suggested Prompts
          </h3>
          
          {isLoadingSuggestions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion.id}
                  variant="outline"
                  className="w-full p-2 sm:p-3 text-left text-xs sm:text-sm h-auto whitespace-normal leading-relaxed"
                  onClick={() => selectPrompt(suggestion)}
                  data-testid={`suggestion-${suggestion.id}`}
                >
                  "{suggestion.text}"
                </Button>
              ))}
            </div>
          )}
        </div>
        
        <div className="mb-4 sm:mb-6">
          <Label className="text-xs sm:text-sm font-medium text-foreground mb-2 block">
            Custom Prompt
          </Label>
          <Textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Describe your ideal focus soundscape..."
            rows={2}
            className="resize-none text-xs sm:text-sm"
            data-testid="textarea-custom-prompt"
          />
        </div>
        
        <div className="flex gap-2 sm:gap-3">
          <Button
            variant="outline"
            className="flex-1 transition-colors active:scale-95 text-xs sm:text-sm py-2 sm:py-3"
            onClick={onClose}
            disabled={isGenerating}
            data-testid="button-cancel-generate"
          >
            Cancel
          </Button>
          <Button
            className="flex-1 transition-colors active:scale-95 text-xs sm:text-sm py-2 sm:py-3"
            onClick={generateSoundscape}
            disabled={isGenerating || !customPrompt.trim() || !canGenerate}
            data-testid="button-generate-soundscape"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generating...
              </>
            ) : (
              "Generate"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
