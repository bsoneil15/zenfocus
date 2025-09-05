import { useMemo } from "react";

interface TimerDisplayProps {
  time: string;
  progress: number;
  mode: "focus" | "break";
  sessionCount: number;
  isRunning: boolean;
}

export function TimerDisplay({ 
  time, 
  progress, 
  mode, 
  sessionCount, 
  isRunning 
}: TimerDisplayProps) {
  const circumference = 2 * Math.PI * 90; // radius = 90
  const strokeDashoffset = useMemo(() => {
    return circumference - (progress * circumference);
  }, [progress, circumference]);

  const sessionDots = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => (
      <i
        key={i}
        className={`fas fa-circle text-xs ${
          i < sessionCount % 4 ? "text-primary" : "text-muted-foreground"
        }`}
        data-testid={`session-dot-${i}`}
      />
    ));
  }, [sessionCount]);

  return (
    <div className="relative mb-8" data-testid="timer-display">
      {/* Background Ring */}
      <div 
        className={`w-72 h-72 sm:w-80 sm:h-80 rounded-full border-4 border-muted ${
          isRunning ? "pulse-ring" : ""
        }`} 
      />
      
      {/* Progress Ring */}
      <svg 
        className="absolute inset-0 w-72 h-72 sm:w-80 sm:h-80 -rotate-90" 
        viewBox="0 0 200 200"
        data-testid="progress-ring"
      >
        <circle
          cx="100"
          cy="100"
          r="90"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-primary"
          style={{ 
            strokeDasharray: circumference,
            strokeDashoffset: strokeDashoffset,
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
            transition: 'stroke-dashoffset 0.3s ease-out'
          }}
        />
      </svg>
      
      {/* Timer Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-center mb-4">
          <div 
            className="text-4xl sm:text-5xl font-mono font-light tracking-wider text-foreground mb-2"
            data-testid="timer-time"
          >
            {time}
          </div>
          <div 
            className="text-sm font-medium text-muted-foreground uppercase tracking-wide"
            data-testid="timer-mode"
          >
            {mode === "focus" ? "Focus Session" : "Break Time"}
          </div>
        </div>
        
        {/* Session Counter */}
        <div className="flex items-center gap-2 mb-4" data-testid="session-counter">
          {sessionDots}
        </div>
      </div>
    </div>
  );
}
