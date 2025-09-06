import { useState, useEffect, useCallback, useRef } from "react";

export type TimerMode = "focus" | "break";

export interface PomodoroState {
  currentTime: number;
  totalTime: number;
  isRunning: boolean;
  mode: TimerMode;
  sessionCount: number;
  isComplete: boolean;
}

export interface PomodoroSettings {
  focusDuration: number; // in minutes
  breakDuration: number; // in minutes
  autoStartBreaks: boolean;
  notifications: boolean;
}

const DEFAULT_SETTINGS: PomodoroSettings = {
  focusDuration: 25,
  breakDuration: 5,
  autoStartBreaks: false,
  notifications: true,
};

export function usePomodoroTimer() {
  const [settings, setSettings] = useState<PomodoroSettings>(() => {
    const saved = localStorage.getItem("pomodoro-settings");
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [state, setState] = useState<PomodoroState>(() => ({
    currentTime: settings.focusDuration * 60,
    totalTime: settings.focusDuration * 60,
    isRunning: false,
    mode: "focus",
    sessionCount: 0,
    isComplete: false,
  }));

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onCompleteRef = useRef<(() => void) | null>(null);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("pomodoro-settings", JSON.stringify(settings));
  }, [settings]);

  const updateSettings = useCallback((newSettings: Partial<PomodoroSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const start = useCallback(() => {
    if (state.currentTime <= 0) return;
    
    setState(prev => ({ ...prev, isRunning: true, isComplete: false }));
    
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    intervalRef.current = setInterval(() => {
      setState(prev => {
        // Double-check we're still running to prevent race conditions
        if (!prev.isRunning) {
          return prev;
        }
        
        const newTime = prev.currentTime - 1;
        
        if (newTime <= 0) {
          // Timer completed - clear the interval here too
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          
          return {
            ...prev,
            currentTime: 0,
            isRunning: false,
            isComplete: true,
          };
        }
        
        return {
          ...prev,
          currentTime: newTime,
        };
      });
    }, 1000);
  }, [state.currentTime]);

  const pause = useCallback(() => {
    setState(prev => ({ ...prev, isRunning: false }));
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentTime: prev.mode === "focus" ? settings.focusDuration * 60 : settings.breakDuration * 60,
      totalTime: prev.mode === "focus" ? settings.focusDuration * 60 : settings.breakDuration * 60,
      isRunning: false,
      isComplete: false,
    }));
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [settings.focusDuration, settings.breakDuration]);

  const switchMode = useCallback(() => {
    const newMode = state.mode === "focus" ? "break" : "focus";
    const newDuration = newMode === "focus" ? settings.focusDuration : settings.breakDuration;
    const newSessionCount = newMode === "focus" ? state.sessionCount : state.sessionCount + 1;
    
    setState(prev => ({
      ...prev,
      mode: newMode,
      currentTime: newDuration * 60,
      totalTime: newDuration * 60,
      isRunning: settings.autoStartBreaks && newMode === "break",
      sessionCount: newSessionCount,
      isComplete: false,
    }));

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Auto-start break if enabled
    if (settings.autoStartBreaks && newMode === "break") {
      setTimeout(() => {
        start();
      }, 100);
    }
  }, [state.mode, state.sessionCount, settings, start]);

  const skip = useCallback(() => {
    setState(prev => ({ ...prev, isComplete: true, isRunning: false }));
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Handle timer completion
  useEffect(() => {
    if (state.isComplete && onCompleteRef.current) {
      onCompleteRef.current();
    }
  }, [state.isComplete]);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const getProgress = useCallback(() => {
    if (state.totalTime === 0) return 0;
    return (state.totalTime - state.currentTime) / state.totalTime;
  }, [state.currentTime, state.totalTime]);

  const getFormattedTime = useCallback(() => {
    const minutes = Math.ceil(state.currentTime / 60);
    return `${minutes}m`;
  }, [state.currentTime]);

  const onComplete = useCallback((callback: () => void) => {
    onCompleteRef.current = callback;
  }, []);

  return {
    state,
    settings,
    updateSettings,
    start,
    pause,
    reset,
    switchMode,
    skip,
    getProgress,
    getFormattedTime,
    onComplete,
  };
}
