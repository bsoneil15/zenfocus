import { useState, useEffect, useRef } from "react";
import { Headphones, Settings, Moon, Sun, LogOut, LogIn, Volume2, VolumeX } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { useAuth } from "@/hooks/use-auth";

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
  const { user, isLoading: isAuthLoading, logout } = useAuth();
  const isMobile = useIsMobile();
  // If audio was already unlocked on a previous visit (persisted in
  // localStorage by useAudioManager), skip the "audio ready" confirmation
  // banner too — returning users shouldn't see any audio-state UI flicker.
  const audioPreviouslyUnlocked = useRef<boolean>(false);
  if (typeof window !== "undefined" && !audioPreviouslyUnlocked.current) {
    try {
      audioPreviouslyUnlocked.current =
        window.localStorage.getItem("audio-unlocked-v1") === "1";
    } catch {}
  }
  const [audioReadyDismissed, setAudioReadyDismissed] = useState(audioPreviouslyUnlocked.current);
  const [hasShownAudioReady, setHasShownAudioReady] = useState(audioPreviouslyUnlocked.current);
  
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
    bonusSoundscapes,
    unavailableIds,
    volume,
    isPlaying,
    setVolume,
    setSoundscape,
    addCustomSoundscape,
    deleteCustomSoundscape,
    playNotificationSound,
    audioUnlocked,
    unlockAudio,
  } = useAudioManager();

  const {
    permission: notificationPermission,
    requestPermission,
    showTimerNotification,
  } = useNotifications();

  useEffect(() => {
    onComplete(() => {
      playNotificationSound();
      
      const handleNotifications = async () => {
        if (settings.notifications) {
          if (notificationPermission === "default") {
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
      
      toast({
        title: timerState.mode === "focus" ? "Great work!" : "Break complete!",
        description: timerState.mode === "focus" 
          ? "Time for a well-deserved break." 
          : "Ready to focus again?",
      });
      
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

  useEffect(() => {
    if (!audioUnlocked || hasShownAudioReady) return;
    setHasShownAudioReady(true);
    const t = setTimeout(() => setAudioReadyDismissed(true), 3000);
    return () => clearTimeout(t);
  }, [audioUnlocked, hasShownAudioReady]);

  useEffect(() => {
    try {
      const today = new Date().toDateString();
      const savedStats = localStorage.getItem(`pomodoro-stats-${today}`);
      if (savedStats) {
        setTodayStats(JSON.parse(savedStats));
      }
    } catch (error) {
      console.error("Failed to load stats from localStorage:", error);
    }
  }, []);

  useEffect(() => {
    try {
      const today = new Date().toDateString();
      localStorage.setItem(`pomodoro-stats-${today}`, JSON.stringify(todayStats));
    } catch (error) {
      console.error("Failed to save stats to localStorage:", error);
    }
  }, [todayStats]);

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
    localStorage.clear();
    sessionStorage.clear();
    queryClient.resetQueries();
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex flex-col overflow-hidden relative">
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
      <header className="flex items-center justify-between p-4 sm:p-6 bg-card/50 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Headphones className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Zen Focus Timer</h1>
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

          {isAuthLoading ? (
            <div
              className="w-10 h-10 rounded-lg"
              aria-hidden="true"
              data-testid="auth-state-loading"
            />
          ) : user ? (
            <Button
              variant="ghost"
              size="icon"
              className="w-10 h-10 rounded-lg"
              onClick={() => logout()}
              title={`Sign out (${user?.firstName || user?.email || 'user'})`}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-10 rounded-lg gap-2"
              onClick={() => { window.location.href = "/api/login"; }}
              title="Sign in"
              data-testid="button-signin"
            >
              <LogIn className="h-4 w-4" />
              <span className="text-sm font-medium">Sign In</span>
            </Button>
          )}
        </div>
      </header>
      {isMobile && !audioUnlocked && (
        <button
          type="button"
          onClick={async () => {
            const ok = await unlockAudio();
            if (!ok) {
              toast({
                title: "Couldn't enable audio",
                description: "Your browser blocked the request. Try tapping again.",
                variant: "destructive",
              });
            }
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          data-testid="button-enable-audio"
        >
          <VolumeX className="h-4 w-4" />
          Tap to enable audio
        </button>
      )}
      {isMobile && audioUnlocked && hasShownAudioReady && !audioReadyDismissed && (
        <div
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs text-muted-foreground bg-muted/50 border-b border-border"
          data-testid="banner-audio-ready"
        >
          <Volume2 className="h-3 w-3" />
          Audio ready
        </div>
      )}
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
          bonusSoundscapes={bonusSoundscapes}
          unavailableIds={unavailableIds}
          volume={volume}
          isPlaying={isPlaying}
          onVolumeChange={setVolume}
          onSoundscapeChange={handleSoundscapeChange}
          onGenerateAI={() => {
            // While auth is still resolving, defer opening the panel so a
            // signed-in user doesn't briefly see the guest sign-in prompt
            // before their session loads.
            if (isAuthLoading) return;
            setIsAIGeneratorOpen(true);
          }}
          canDeleteCustom={!!user}
          onDeleteCustom={deleteCustomSoundscape}
        />

        <SessionStats
          sessionsToday={todayStats.sessions}
          minutesToday={todayStats.minutes}
          breaksToday={todayStats.breaks}
        />
      </main>
      <footer className="text-center py-4 text-sm text-muted-foreground border-t border-border">
        Built by Brendan O'Neil with Replit, elevenlabs and OpenAI
      </footer>
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
        isAuthenticated={!!user}
        onClose={() => setIsAIGeneratorOpen(false)}
        onSoundscapeGenerated={handleSoundscapeGenerated}
      />
    </div>
  );
}
