import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, SkipForward } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TimerControlsProps {
  isRunning: boolean;
  onStartPause: () => void;
  onReset: () => void;
  onSkip: () => void;
  disabled?: boolean;
}

const SPAM_WINDOW_MS = 1500;
const SPAM_THRESHOLD = 3;
const SPAM_COOLDOWN_MS = 10000;

const SPAM_MESSAGES = [
  "The timer definitely heard you the first time.",
  "Deep breaths — that's literally what this app is for.",
  "You don't need to click it that many times, I promise.",
  "The timer is running, not the developers.",
];

export function TimerControls({
  isRunning,
  onStartPause,
  onReset,
  onSkip,
  disabled = false,
}: TimerControlsProps) {
  const { toast } = useToast();
  const clickTimestamps = useRef<number[]>([]);
  const lastSpamToastAt = useRef<number>(0);

  const handleClick = (action: () => void) => {
    if (disabled) return;

    const now = Date.now();

    clickTimestamps.current = [
      ...clickTimestamps.current.filter((t) => now - t < SPAM_WINDOW_MS),
      now,
    ];

    action();

    if (
      clickTimestamps.current.length >= SPAM_THRESHOLD &&
      now - lastSpamToastAt.current > SPAM_COOLDOWN_MS
    ) {
      lastSpamToastAt.current = now;
      clickTimestamps.current = [];
      const msg = SPAM_MESSAGES[Math.floor(Math.random() * SPAM_MESSAGES.length)];
      toast({ description: msg });
    }
  };

  return (
    <div className="flex items-center gap-4 mb-8" data-testid="timer-controls">
      <Button
        variant="ghost"
        size="icon"
        className="w-12 h-12 rounded-full bg-muted hover:bg-accent transition-all duration-200 active:scale-95"
        onClick={() => handleClick(onReset)}
        disabled={disabled}
        data-testid="button-reset"
      >
        <RotateCcw className="h-5 w-5 text-muted-foreground" />
      </Button>
      
      <Button
        size="icon"
        className="w-16 h-16 rounded-full bg-primary hover:bg-primary/90 transition-all duration-200 shadow-lg active:scale-95"
        onClick={() => handleClick(onStartPause)}
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
        onClick={() => handleClick(onSkip)}
        disabled={disabled}
        data-testid="button-skip"
      >
        <SkipForward className="h-5 w-5 text-muted-foreground" />
      </Button>
    </div>
  );
}
