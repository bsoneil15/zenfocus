import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, SkipForward } from "lucide-react";

interface TimerControlsProps {
  isRunning: boolean;
  onStartPause: () => void;
  onReset: () => void;
  onSkip: () => void;
  disabled?: boolean;
}

export function TimerControls({
  isRunning,
  onStartPause,
  onReset,
  onSkip,
  disabled = false,
}: TimerControlsProps) {
  return (
    <div className="flex items-center gap-4 mb-8" data-testid="timer-controls">
      <Button
        variant="ghost"
        size="icon"
        className="w-12 h-12 rounded-full bg-muted hover:bg-accent transition-all duration-200 active:scale-95"
        onClick={onReset}
        disabled={disabled}
        data-testid="button-reset"
      >
        <RotateCcw className="h-5 w-5 text-muted-foreground" />
      </Button>
      
      <Button
        size="icon"
        className="w-16 h-16 rounded-full bg-primary hover:bg-primary/90 transition-all duration-200 shadow-lg active:scale-95"
        onClick={onStartPause}
        disabled={disabled}
        data-testid="button-start-pause"
      >
        {isRunning ? (
          <Pause className="h-6 w-6 text-primary-foreground" />
        ) : (
          <Play className="h-6 w-6 text-primary-foreground ml-1" />
        )}
      </Button>
      
      <Button
        variant="ghost"
        size="icon"
        className="w-12 h-12 rounded-full bg-muted hover:bg-accent transition-all duration-200 active:scale-95"
        onClick={onSkip}
        disabled={disabled}
        data-testid="button-skip"
      >
        <SkipForward className="h-5 w-5 text-muted-foreground" />
      </Button>
    </div>
  );
}
