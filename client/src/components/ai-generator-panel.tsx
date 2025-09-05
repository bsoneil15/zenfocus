import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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

    setIsGenerating(true);
    try {
      const response = await apiRequest("POST", "/api/soundscapes/generate", {
        prompt: customPrompt.trim(),
        duration: 20,
        looping: true,
      });
      
      const data = await response.json();
      
      onSoundscapeGenerated({
        id: data.id,
        name: data.name,
        audioUrl: data.audioUrl,
        prompt: customPrompt.trim(),
      });
      
      toast({
        title: "Success",
        description: "Custom soundscape generated successfully!",
      });
      
      setCustomPrompt("");
      onClose();
    } catch (error) {
      console.error("Failed to generate soundscape:", error);
      toast({
        title: "Error",
        description: "Failed to generate soundscape. Please try again.",
        variant: "destructive",
      });
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
        className={`absolute bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-3xl p-6 transform transition-transform duration-300 ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-6" />
        
        <h2 className="text-lg font-semibold text-foreground mb-2">
          AI Soundscape Generator
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Generate custom focus soundscapes using AI
        </p>
        
        <div className="space-y-4 mb-6">
          <h3 className="text-sm font-medium text-foreground">
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
                  className="w-full p-3 text-left text-sm h-auto"
                  onClick={() => selectPrompt(suggestion)}
                  data-testid={`suggestion-${suggestion.id}`}
                >
                  "{suggestion.text}"
                </Button>
              ))}
            </div>
          )}
        </div>
        
        <div className="mb-6">
          <Label className="text-sm font-medium text-foreground mb-2 block">
            Custom Prompt
          </Label>
          <Textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Describe your ideal focus soundscape..."
            rows={3}
            className="resize-none"
            data-testid="textarea-custom-prompt"
          />
        </div>
        
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 transition-colors active:scale-95"
            onClick={onClose}
            disabled={isGenerating}
            data-testid="button-cancel-generate"
          >
            Cancel
          </Button>
          <Button
            className="flex-1 transition-colors active:scale-95"
            onClick={generateSoundscape}
            disabled={isGenerating || !customPrompt.trim()}
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
