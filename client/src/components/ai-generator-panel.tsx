import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface DailyUsage {
  used: number;
  remaining: number;
  limit: number;
}

interface HourlyUsage {
  used: number;
  remaining: number;
  limit: number;
  resetInMinutes: number;
}

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
  const queryClient = useQueryClient();
  const lastAlreadyGeneratingToastAt = useRef<number>(0);

  const { data: dailyUsage, isLoading: isLoadingUsage } = useQuery<DailyUsage>({
    queryKey: ["/api/soundscapes/daily-limit"],
    enabled: isOpen,
  });

  const { data: hourlyUsage, isLoading: isLoadingHourly } = useQuery<HourlyUsage>({
    queryKey: ["/api/soundscapes/hourly-limit"],
    enabled: isOpen,
  });

  const remainingGenerations = dailyUsage?.remaining ?? 0;
  const dailyLimit = dailyUsage?.limit ?? 3;
  const hourlyRemaining = hourlyUsage?.remaining ?? 5;
  const hourlyLimit = hourlyUsage?.limit ?? 5;
  const canGenerate = (dailyUsage?.remaining ?? 0) > 0 && (hourlyUsage?.remaining ?? 5) > 0;

  const loadSuggestions = useCallback(async () => {
    setIsLoadingSuggestions(true);
    try {
      const response = await apiRequest("GET", "/api/soundscapes/suggestions");
      const data = await response.json();
      setSuggestions(data.suggestions);
    } catch (error) {
      console.error("Failed to load suggestions:", error);
      setSuggestions([
        { id: "1", text: "Gentle forest ambience with distant birds and rustling leaves" },
        { id: "2", text: "Soft ocean waves with subtle wind through beach grass" },
        { id: "3", text: "Cozy fireplace crackling with distant mountain wind" },
      ]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

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

    // Check limits (server-side enforced; this is just a UX guard)
    if (!canGenerate) {
      const hourlyExhausted = (hourlyUsage?.remaining ?? 5) <= 0;
      const dailyExhausted = (dailyUsage?.remaining ?? 0) <= 0;
      if (hourlyExhausted && !dailyExhausted) {
        const resetIn = hourlyUsage?.resetInMinutes ?? 'a few';
        toast({
          title: "Hourly limit reached",
          description: `You've used all ${hourlyLimit} hourly generations. Try again in ${resetIn} minute${resetIn === 1 ? '' : 's'}.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "You're all out for today",
          description: `That's your ${dailyLimit} for the day — this little app runs on real API credits, not unlimited magic. Come back tomorrow!`,
          variant: "destructive",
        });
      }
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

      // Update daily usage cache from server response, then refetch to be safe
      if (data.dailyUsage) {
        queryClient.setQueryData(["/api/soundscapes/daily-limit"], data.dailyUsage);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/soundscapes/daily-limit"] });

      onSoundscapeGenerated({
        id: data.id,
        name: data.name,
        audioUrl: data.audioUrl,
        prompt: customPrompt.trim(),
      });

      loadingToast.dismiss();
      const remaining = data.dailyUsage?.remaining ?? 0;
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
      
      loadingToast.dismiss();

      const errorData = error?.data ?? {};
      const status = error?.status;

      // Server-enforced per-account/IP daily limit
      if (status === 429 && errorData.code === "daily_limit_reached") {
        if (errorData.remaining !== undefined && errorData.limit !== undefined) {
          queryClient.setQueryData(["/api/soundscapes/daily-limit"], {
            used: errorData.used,
            remaining: errorData.remaining,
            limit: errorData.limit,
          });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/soundscapes/daily-limit"] });
        toast({
          title: "You're all out for today",
          description: "That's the daily cap — building this cost actual money, so I had to draw the line somewhere. See you tomorrow!",
          variant: "destructive",
        });
        return;
      }

      // Local rate-limit middleware (per-IP) returns retryAfter/maxRequests
      if (status === 429 && errorData.retryAfter !== undefined) {
        const retryMinutes = errorData.retryAfter
          ? Math.ceil(errorData.retryAfter / (60 * 1000))
          : 'a few';
        toast({
          title: "Easy there!",
          description: `This is a fun side project, not a soundscape factory. Give it ${retryMinutes} minute${retryMinutes === 1 ? '' : 's'} and try again.`,
          variant: "destructive",
        });
        return;
      }

      const description =
        errorData.message ||
        (error instanceof Error ? error.message : "Failed to generate soundscape. Please try again.");

      toast({
        title:
          status === 429 ? "Slow down a little" :
          status === 503 ? "Generation Unavailable" :
          "Couldn't generate soundscape",
        description,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
      queryClient.invalidateQueries({ queryKey: ["/api/soundscapes/hourly-limit"] });
    }
  };

  // Load suggestions whenever the panel opens
  useEffect(() => {
    if (isOpen) {
      loadSuggestions();
    }
  }, [isOpen, loadSuggestions]);

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
        <div className="flex flex-wrap items-center justify-center gap-2 mb-4 sm:mb-6">
          <div className={`text-xs px-3 py-1 rounded-full text-center ${
            remainingGenerations > 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
          }`}>
            {isLoadingUsage
              ? 'Checking...'
              : remainingGenerations > 0
                ? `${remainingGenerations} of ${dailyLimit} daily uses left`
                : 'Daily limit reached (resets tomorrow)'}
          </div>
          <div className={`text-xs px-3 py-1 rounded-full text-center ${
            isLoadingHourly ? 'bg-muted text-muted-foreground'
            : hourlyRemaining > 0 ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
          }`}>
            {isLoadingHourly
              ? 'Checking...'
              : hourlyRemaining > 0
                ? `${hourlyRemaining} of ${hourlyLimit} hourly uses left`
                : `Hourly limit reached (resets in ${hourlyUsage?.resetInMinutes ?? '?'} min)`}
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
        
        <div
          className="flex gap-2 sm:gap-3"
          onClick={() => {
            if (isGenerating) {
              const now = Date.now();
              if (now - lastAlreadyGeneratingToastAt.current > 4000) {
                lastAlreadyGeneratingToastAt.current = now;
                toast({
                  title: "Still on it!",
                  description: "Real AI is doing real work here — just give it a moment.",
                });
              }
            }
          }}
        >
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
            disabled={isGenerating || !customPrompt.trim() || !canGenerate || isLoadingUsage}
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
