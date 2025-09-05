import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VolumeX, Cloud, Coffee, Sparkles } from "lucide-react";
import type { SoundscapeType, CustomSoundscape } from "@/hooks/use-audio-manager";

interface AudioControlsProps {
  currentSoundscape: SoundscapeType;
  customSoundscapes: CustomSoundscape[];
  isPlaying: boolean;
  onSoundscapeChange: (type: SoundscapeType, customId?: string) => void;
  onGenerateAI: () => void;
}

export function AudioControls({
  currentSoundscape,
  customSoundscapes,
  isPlaying,
  onSoundscapeChange,
  onGenerateAI,
}: AudioControlsProps) {
  const soundwaveBars = Array.from({ length: 4 }, (_, i) => (
    <div
      key={i}
      className={`w-1 bg-primary rounded-full soundwave ${
        isPlaying ? "" : "opacity-50"
      }`}
      style={{
        height: `${[12, 16, 8, 16][i]}px`,
        animationDelay: `${i * 0.1}s`,
        animationPlayState: isPlaying ? "running" : "paused",
      }}
    />
  ));

  return (
    <Card className="w-full max-w-md shadow-sm" data-testid="audio-controls">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground">Soundscape</h3>
          <div className="flex items-center gap-1" data-testid="soundwave-indicator">
            {soundwaveBars}
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Button
            variant={currentSoundscape === "none" ? "default" : "ghost"}
            size="sm"
            className="p-3 text-xs font-medium transition-all duration-200 active:scale-95 flex flex-col items-center gap-1"
            onClick={() => onSoundscapeChange("none")}
            data-testid="soundscape-none"
          >
            <VolumeX className="h-4 w-4" />
            Silent
          </Button>
          
          <Button
            variant={currentSoundscape === "rain" ? "default" : "ghost"}
            size="sm"
            className="p-3 text-xs font-medium transition-all duration-200 active:scale-95 flex flex-col items-center gap-1"
            onClick={() => onSoundscapeChange("rain")}
            data-testid="soundscape-rain"
          >
            <Cloud className="h-4 w-4" />
            Rain
          </Button>
          
          <Button
            variant={currentSoundscape === "coffee" ? "default" : "ghost"}
            size="sm"
            className="p-3 text-xs font-medium transition-all duration-200 active:scale-95 flex flex-col items-center gap-1"
            onClick={() => onSoundscapeChange("coffee")}
            data-testid="soundscape-coffee"
          >
            <Coffee className="h-4 w-4" />
            Coffee Shop
          </Button>
        </div>
        
        {/* Custom Soundscapes */}
        {customSoundscapes.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {customSoundscapes.slice(0, 4).map((soundscape) => (
              <Button
                key={soundscape.id}
                variant={currentSoundscape === "custom" ? "default" : "ghost"}
                size="sm"
                className="p-2 text-xs font-medium transition-all duration-200 active:scale-95"
                onClick={() => onSoundscapeChange("custom", soundscape.id)}
                data-testid={`custom-soundscape-${soundscape.id}`}
              >
                {soundscape.name}
              </Button>
            ))}
          </div>
        )}
        
        <Button
          variant="outline"
          className="w-full transition-all duration-200 active:scale-95"
          onClick={onGenerateAI}
          data-testid="button-generate-ai"
        >
          <Sparkles className="h-4 w-4 mr-2 text-primary" />
          <span className="text-sm font-medium">Generate AI Soundscape</span>
        </Button>
      </CardContent>
    </Card>
  );
}
