import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { VolumeX, Volume2, Cloud, Coffee, Sparkles, Package, Star } from "lucide-react";
import type { SoundscapeType, CustomSoundscape, PackSoundscape } from "@/hooks/use-audio-manager";

interface AudioControlsProps {
  currentSoundscape: SoundscapeType;
  currentSoundscapeId: string | null;
  customSoundscapes: CustomSoundscape[];
  packSoundscapes: PackSoundscape[];
  isPlaying: boolean;
  volume: number;
  onSoundscapeChange: (type: SoundscapeType, customId?: string) => void;
  onVolumeChange: (volume: number) => void;
  onGenerateAI: () => void;
  onViewPacks: () => void;
}

export function AudioControls({
  currentSoundscape,
  currentSoundscapeId,
  customSoundscapes,
  packSoundscapes,
  isPlaying,
  volume,
  onSoundscapeChange,
  onVolumeChange,
  onGenerateAI,
  onViewPacks,
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
        
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Button
            variant={currentSoundscape === "none" ? "default" : "ghost"}
            size="sm"
            className="py-4 px-3 h-auto text-xs font-medium transition-all duration-200 active:scale-95 flex flex-col items-center gap-2"
            onClick={() => onSoundscapeChange("none")}
            data-testid="soundscape-none"
          >
            <VolumeX className="h-4 w-4" />
            Silent
          </Button>
          
          <Button
            variant={currentSoundscape === "rain" ? "default" : "ghost"}
            size="sm"
            className="py-4 px-3 h-auto text-xs font-medium transition-all duration-200 active:scale-95 flex flex-col items-center gap-2"
            onClick={() => onSoundscapeChange("rain")}
            data-testid="soundscape-rain"
          >
            <Cloud className="h-4 w-4" />
            Rain
          </Button>
          
          <Button
            variant={currentSoundscape === "coffee" ? "default" : "ghost"}
            size="sm"
            className="py-4 px-3 h-auto text-xs font-medium transition-all duration-200 active:scale-95 flex flex-col items-center gap-2"
            onClick={() => onSoundscapeChange("coffee")}
            data-testid="soundscape-coffee"
          >
            <Coffee className="h-4 w-4" />
            Coffee Shop
          </Button>
        </div>
        
        {/* Pack Soundscapes (unlocked) */}
        {packSoundscapes.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {packSoundscapes.slice(0, 4).map((soundscape) => {
              const getEmoji = (name: string) => {
                if (name.toLowerCase().includes('park')) return '🌳';
                if (name.toLowerCase().includes('thunder') || name.toLowerCase().includes('storm')) return '⛈️';
                if (name.toLowerCase().includes('jazz') || name.toLowerCase().includes('bar')) return '🎷';
                return '⭐';
              };
              
              return (
                <Button
                  key={soundscape.id}
                  variant={currentSoundscape === "pack" && currentSoundscapeId === soundscape.id ? "default" : "ghost"}
                  size="sm"
                  className="py-3 px-4 h-auto text-xs font-medium transition-all duration-200 active:scale-95 flex flex-col items-center gap-1 relative"
                  onClick={() => onSoundscapeChange("pack", soundscape.id)}
                  data-testid={`pack-soundscape-${soundscape.id}`}
                >
                  <Star className="absolute top-1 right-1 h-3 w-3 text-muted-foreground/60" />
                  <span className="text-sm">{getEmoji(soundscape.name)}</span>
                  {soundscape.name}
                </Button>
              );
            })}
          </div>
        ) : (
          <div className="mb-4">
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="py-3 px-4 h-auto text-xs font-medium transition-all duration-200 opacity-50 cursor-not-allowed flex flex-col items-center gap-1"
                disabled
                data-testid="locked-pack-soundscape"
              >
                <span className="text-sm">🔒</span>
                Pack Sounds
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="py-3 px-4 h-auto text-xs font-medium transition-all duration-200 active:scale-95"
                onClick={onViewPacks}
                data-testid="unlock-packs-button"
              >
                <span className="text-sm">⚙️</span>
                Unlock in Settings
              </Button>
            </div>
          </div>
        )}
        
        {/* Custom Soundscapes */}
        {customSoundscapes.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {customSoundscapes.slice(0, 4).map((soundscape) => (
              <Button
                key={soundscape.id}
                variant={currentSoundscape === "custom" && currentSoundscapeId === soundscape.id ? "default" : "ghost"}
                size="sm"
                className="py-3 px-4 h-auto text-xs font-medium transition-all duration-200 active:scale-95"
                onClick={() => onSoundscapeChange("custom", soundscape.id)}
                data-testid={`custom-soundscape-${soundscape.id}`}
              >
                {soundscape.name}
              </Button>
            ))}
          </div>
        )}
        
        {/* Volume Control */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-8 h-8">
            {volume === 0 ? (
              <VolumeX className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Volume2 className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <Slider
            value={[volume * 100]}
            onValueChange={(value) => onVolumeChange(value[0] / 100)}
            max={100}
            min={0}
            step={5}
            className="flex-1"
            data-testid="volume-slider"
          />
          <span className="text-xs text-muted-foreground w-8 text-center">
            {Math.round(volume * 100)}%
          </span>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="py-3 h-auto transition-all duration-200 active:scale-95"
            onClick={onGenerateAI}
            data-testid="button-generate-ai"
          >
            <Sparkles className="h-4 w-4 mr-1 text-primary" />
            <span className="text-sm font-medium">Generate AI</span>
          </Button>
          
          <Button
            variant="outline"
            className="py-3 h-auto transition-all duration-200 active:scale-95"
            onClick={onViewPacks}
            data-testid="button-view-packs"
          >
            <Package className="h-4 w-4 mr-1 text-primary" />
            <span className="text-sm font-medium">{packSoundscapes.length > 0 ? 'View Packs' : 'Unlock Packs'}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
