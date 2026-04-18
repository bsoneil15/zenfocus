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
    try {
      const saved = localStorage.getItem("pomodoro-settings");
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch (error) {
      console.error("Failed to load settings from localStorage:", error);
      return DEFAULT_SETTINGS;
    }
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
  const prevModeRef = useRef<TimerMode>("focus");
  const currentTimeRef = useRef<number>(state.currentTime);

  // Keep a ref of currentTime in sync so callbacks can read the latest value
  // without needing to re-create the callback on every tick.
  useEffect(() => {
    currentTimeRef.current = state.currentTime;
  }, [state.currentTime]);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem("pomodoro-settings", JSON.stringify(settings));
    } catch (error) {
      console.error("Failed to save settings to localStorage:", error);
    }
  }, [settings]);

  const updateSettings = useCallback((newSettings: Partial<PomodoroSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const start = useCallback(() => {
    if (currentTimeRef.current <= 0) return;

    setState(prev => {
      if (prev.currentTime <= 0) return prev;
      return { ...prev, isRunning: true, isComplete: false };
    });

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      setState(prev => {
        if (!prev.isRunning) {
          return prev;
        }
        
        const newTime = prev.currentTime - 1;
        
        if (newTime <= 0) {
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
  }, []);

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
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setState(prev => {
      const newMode = prev.mode === "focus" ? "break" : "focus";
      const newDuration = newMode === "focus" ? settings.focusDuration : settings.breakDuration;
      const newSessionCount = newMode === "focus" ? prev.sessionCount : prev.sessionCount + 1;
      
      return {
        ...prev,
        mode: newMode,
        currentTime: newDuration * 60,
        totalTime: newDuration * 60,
        isRunning: false,
        sessionCount: newSessionCount,
        isComplete: false,
      };
    });

  }, [settings]);

  const skip = useCallback(() => {
    setState(prev => ({ ...prev, isComplete: true, isRunning: false }));
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Auto-start break timer when mode switches to break (if autoStartBreaks is enabled)
  useEffect(() => {
    if (state.mode !== prevModeRef.current) {
      prevModeRef.current = state.mode;
      if (settings.autoStartBreaks && state.mode === "break" && !state.isRunning) {
        start();
      }
    }
  }, [state.mode, settings.autoStartBreaks, state.isRunning, start]);

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
    const minutes = Math.floor(state.currentTime / 60);
    const seconds = state.currentTime % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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
