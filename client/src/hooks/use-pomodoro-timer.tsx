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
  // Wall-clock deadline so background-tab timer throttling does not stretch
  // a 25-minute focus into 30+ minutes of real time.
  const deadlineMsRef = useRef<number | null>(null);

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

  const clearTick = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const updateSettings = useCallback((newSettings: Partial<PomodoroSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const start = useCallback(() => {
    if (currentTimeRef.current <= 0) return;

    deadlineMsRef.current = Date.now() + currentTimeRef.current * 1000;

    setState(prev => {
      if (prev.currentTime <= 0) return prev;
      return { ...prev, isRunning: true, isComplete: false };
    });

    clearTick();

    intervalRef.current = setInterval(() => {
      const deadline = deadlineMsRef.current;
      if (deadline == null) return;

      const remainingMs = deadline - Date.now();
      const newTime = Math.max(0, Math.ceil(remainingMs / 1000));

      if (newTime <= 0) {
        clearTick();
        deadlineMsRef.current = null;
        setState(prev => {
          if (!prev.isRunning) return prev;
          return {
            ...prev,
            currentTime: 0,
            isRunning: false,
            isComplete: true,
          };
        });
        return;
      }

      setState(prev => {
        if (!prev.isRunning) return prev;
        if (prev.currentTime === newTime) return prev;
        return {
          ...prev,
          currentTime: newTime,
        };
      });
    }, 250);
  }, [clearTick]);

  const pause = useCallback(() => {
    deadlineMsRef.current = null;
    setState(prev => ({ ...prev, isRunning: false }));
    clearTick();
  }, [clearTick]);

  const reset = useCallback(() => {
    deadlineMsRef.current = null;
    setState(prev => ({
      ...prev,
      currentTime: prev.mode === "focus" ? settings.focusDuration * 60 : settings.breakDuration * 60,
      totalTime: prev.mode === "focus" ? settings.focusDuration * 60 : settings.breakDuration * 60,
      isRunning: false,
      isComplete: false,
    }));
    clearTick();
  }, [settings.focusDuration, settings.breakDuration, clearTick]);

  const switchMode = useCallback(() => {
    deadlineMsRef.current = null;
    clearTick();

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

  }, [settings, clearTick]);

  // Skip ends the current phase early without treating it as a completed
  // session (no congratulations toast, no full-duration minutes credit).
  const skip = useCallback(() => {
    deadlineMsRef.current = null;
    clearTick();

    setState(prev => {
      const newMode = prev.mode === "focus" ? "break" : "focus";
      const newDuration = newMode === "focus" ? settings.focusDuration : settings.breakDuration;
      // Still advance the pomodoro cycle count when leaving a focus phase,
      // but do not set isComplete so the completion handler does not fire.
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
  }, [settings, clearTick]);

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
      clearTick();
    };
  }, [clearTick]);

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
