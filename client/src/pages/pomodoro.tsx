import { useState, useEffect } from "react";
import { Brain, Settings, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePomodoroTimer } from "@/hooks/use-pomodoro-timer";
import { useAudioManager } from "@/hooks/use-audio-manager";
import { useNotifications } from "@/hooks/use-notifications";
import { useTheme } from "@/components/theme-provider";
import { TimerDisplay } from "@/components/timer-display";
import { TimerControls } from "@/components/timer-controls";
import { AudioControls } from "@/components/audio-controls";
import { SessionStats } from "@/components/session-stats";
import { SettingsPanel } from "@/components/settings-panel";
import { AIGeneratorPanel } from "@/components/ai-generator-panel";

export default function PomodoroPage() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAIGeneratorOpen, setIsAIGeneratorOpen] = useState(false);
  const [todayStats, setTodayStats] = useState({
    sessions: 0,
    minutes: 0,
    breaks: 0,
  });

  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  
  const {
    state: timerState,
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
  } = usePomodoroTimer();

  const {
    currentSoundscape,
    customSoundscapes,
    volume,
    isPlaying,
    setVolume,
    setSoundscape,
    addCustomSoundscape,
    playNotificationSound,
  } = useAudioManager();

  const {
    permission: notificationPermission,
    requestPermission,
    showTimerNotification,
  } = useNotifications();

  // Handle timer completion
  useEffect(() => {
    onComplete(() => {
      // Play notification sound
      playNotificationSound();
      
      // Show browser notification
      if (settings.notifications && notificationPermission === "granted") {
        showTimerNotification(timerState.mode === "focus");
      }
      
      // Show toast notification
      toast({
        title: timerState.mode === "focus" ? "Great work!" : "Break complete!",
        description: timerState.mode === "focus" 
          ? "Time for a well-deserved break." 
          : "Ready to focus again?",
      });
      
      // Update stats
      if (timerState.mode === "focus") {
        setTodayStats(prev => ({
          ...prev,
          sessions: prev.sessions + 1,
          minutes: prev.minutes + settings.focusDuration,
        }));
      } else {
        setTodayStats(prev => ({
          ...prev,
          breaks: prev.breaks + 1,
        }));
      }
      
      // Auto-switch mode
      setTimeout(() => {
        switchMode();
      }, 1000);
    });
  }, [
    onComplete,
    playNotificationSound,
    settings.notifications,
    settings.focusDuration,
    notificationPermission,
    showTimerNotification,
    timerState.mode,
    toast,
    switchMode,
  ]);

  // Load today's stats from localStorage
  useEffect(() => {
    const today = new Date().toDateString();
    const savedStats = localStorage.getItem(`pomodoro-stats-${today}`);
    if (savedStats) {
      setTodayStats(JSON.parse(savedStats));
    }
  }, []);

  // Save stats to localStorage
  useEffect(() => {
    const today = new Date().toDateString();
    localStorage.setItem(`pomodoro-stats-${today}`, JSON.stringify(todayStats));
  }, [todayStats]);

  const handleStartPause = () => {
    if (timerState.isRunning) {
      pause();
    } else {
      start();
    }
  };

  const handleSoundscapeChange = async (type: any, customId?: string) => {
    await setSoundscape(type, customId);
  };

  const handleSoundscapeGenerated = (soundscape: any) => {
    addCustomSoundscape(soundscape);
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="min-h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between p-4 sm:p-6 bg-card/50 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Brain className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Focus Flow</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="w-10 h-10 rounded-lg"
            onClick={toggleTheme}
            data-testid="button-theme-toggle"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            className="w-10 h-10 rounded-lg"
            onClick={() => setIsSettingsOpen(true)}
            data-testid="button-settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 relative">
        <TimerDisplay
          time={getFormattedTime()}
          progress={getProgress()}
          mode={timerState.mode}
          sessionCount={timerState.sessionCount}
          isRunning={timerState.isRunning}
        />

        <TimerControls
          isRunning={timerState.isRunning}
          onStartPause={handleStartPause}
          onReset={reset}
          onSkip={skip}
        />

        <AudioControls
          currentSoundscape={currentSoundscape}
          customSoundscapes={customSoundscapes}
          volume={volume}
          isPlaying={isPlaying}
          onVolumeChange={setVolume}
          onSoundscapeChange={handleSoundscapeChange}
          onGenerateAI={() => setIsAIGeneratorOpen(true)}
        />

        <SessionStats
          sessionsToday={todayStats.sessions}
          minutesToday={todayStats.minutes}
          breaksToday={todayStats.breaks}
        />
      </main>

      {/* Panels */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        settings={settings}
        onClose={() => setIsSettingsOpen(false)}
        onUpdateSettings={updateSettings}
        onRequestNotifications={requestPermission}
      />

      <AIGeneratorPanel
        isOpen={isAIGeneratorOpen}
        onClose={() => setIsAIGeneratorOpen(false)}
        onSoundscapeGenerated={handleSoundscapeGenerated}
      />
    </div>
  );
}
