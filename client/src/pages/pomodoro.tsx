import { useState, useEffect } from "react";
import { Headphones, Settings, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePomodoroTimer } from "@/hooks/use-pomodoro-timer";
import { useAudioManager } from "@/hooks/use-audio-manager";
import { useNotifications } from "@/hooks/use-notifications";
import { useTheme } from "@/components/theme-provider";
import { queryClient } from "@/lib/queryClient";
import { TimerDisplay } from "@/components/timer-display";
import { TimerControls } from "@/components/timer-controls";
import { AudioControls } from "@/components/audio-controls";
import { SessionStats } from "@/components/session-stats";
import { SettingsPanel } from "@/components/settings-panel";
import { AIGeneratorPanel } from "@/components/ai-generator-panel";
import { SoundscapePacksPanel } from "@/components/soundscape-packs-panel";

export default function PomodoroPage() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAIGeneratorOpen, setIsAIGeneratorOpen] = useState(false);
  const [isSoundscapePacksOpen, setIsSoundscapePacksOpen] = useState(false);
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
    currentSoundscapeId,
    customSoundscapes,
    packSoundscapes,
    volume,
    isPlaying,
    setVolume,
    setSoundscape,
    addCustomSoundscape,
    playNotificationSound,
    loadPackSoundscapes,
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
      
      // Handle notifications
      const handleNotifications = async () => {
        if (settings.notifications) {
          if (notificationPermission === "default") {
            // Request permission with a toast first
            toast({
              title: "Enable Notifications?",
              description: "Get notified when your timer completes. Click to enable.",
              action: (
                <button 
                  onClick={requestPermission}
                  className="text-primary underline"
                >
                  Enable
                </button>
              ),
            });
          } else if (notificationPermission === "granted") {
            showTimerNotification(timerState.mode === "focus");
          }
        }
      };

      handleNotifications();
      
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

  // Update browser tab title with remaining time
  useEffect(() => {
    const formattedTime = getFormattedTime();
    const modeText = timerState.mode === "focus" ? "Focus" : "Break";
    const statusIcon = timerState.isRunning ? "⏰" : "⏸️";
    
    document.title = timerState.isRunning || timerState.currentTime < (timerState.mode === "focus" ? settings.focusDuration * 60 : settings.breakDuration * 60)
      ? `${statusIcon} ${formattedTime} ${modeText} - Focus Flow`
      : "Focus Flow - Pomodoro Timer";
  }, [getFormattedTime, timerState.mode, timerState.isRunning, timerState.currentTime, settings.focusDuration, settings.breakDuration]);

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

  const handleRefreshApp = () => {
    // Clear all app data and cache for testing
    localStorage.clear();
    sessionStorage.clear();
    
    // Clear query cache
    queryClient.clear();
    
    // Force reload with cache clearing
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex flex-col overflow-hidden relative">
      {/* Refresh Button - Very Faint in Bottom Right */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed bottom-4 right-4 w-8 h-8 opacity-10 hover:opacity-30 transition-opacity duration-300 text-muted-foreground/30"
        onClick={handleRefreshApp}
        data-testid="button-refresh"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </Button>

      {/* Header */}
      <header className="flex items-center justify-between p-4 sm:p-6 bg-card/50 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Headphones className="h-4 w-4 text-primary-foreground" />
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
          currentSoundscapeId={currentSoundscapeId}
          customSoundscapes={customSoundscapes}
          packSoundscapes={packSoundscapes}
          volume={volume}
          isPlaying={isPlaying}
          onVolumeChange={setVolume}
          onSoundscapeChange={handleSoundscapeChange}
          onGenerateAI={() => setIsAIGeneratorOpen(true)}
          onViewPacks={() => setIsSoundscapePacksOpen(true)}
        />

        <SessionStats
          sessionsToday={todayStats.sessions}
          minutesToday={todayStats.minutes}
          breaksToday={todayStats.breaks}
        />
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-sm text-muted-foreground border-t border-border">
        🎧⏳ Built by Brendan O'Neil with Replit, elevenlabs and OpenAI
      </footer>

      {/* Panels */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        settings={settings}
        notificationPermission={notificationPermission}
        onClose={() => setIsSettingsOpen(false)}
        onUpdateSettings={updateSettings}
        onRequestNotifications={requestPermission}
      />

      <AIGeneratorPanel
        isOpen={isAIGeneratorOpen}
        onClose={() => setIsAIGeneratorOpen(false)}
        onSoundscapeGenerated={handleSoundscapeGenerated}
      />

      <SoundscapePacksPanel
        isOpen={isSoundscapePacksOpen}
        onClose={() => setIsSoundscapePacksOpen(false)}
        onPacksUnlocked={() => {
          // Refresh pack soundscapes when packs are unlocked
          loadPackSoundscapes();
        }}
      />
    </div>
  );
}
