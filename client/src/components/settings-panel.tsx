import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { PomodoroSettings } from "@/hooks/use-pomodoro-timer";

interface SettingsPanelProps {
  isOpen: boolean;
  settings: PomodoroSettings;
  notificationPermission: NotificationPermission;
  onClose: () => void;
  onUpdateSettings: (settings: Partial<PomodoroSettings>) => void;
  onRequestNotifications: () => void;
}

export function SettingsPanel({
  isOpen,
  settings,
  notificationPermission,
  onClose,
  onUpdateSettings,
  onRequestNotifications,
}: SettingsPanelProps) {
  const [focusDuration, setFocusDuration] = useState([settings.focusDuration]);
  const [breakDuration, setBreakDuration] = useState([settings.breakDuration]);

  useEffect(() => {
    setFocusDuration([settings.focusDuration]);
    setBreakDuration([settings.breakDuration]);
  }, [settings.focusDuration, settings.breakDuration]);

  const handleSave = () => {
    onUpdateSettings({
      focusDuration: focusDuration[0],
      breakDuration: breakDuration[0],
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" 
      data-testid="settings-panel"
    >
      <div 
        className={`absolute bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-3xl p-6 transform transition-transform duration-300 ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-6" />
        
        <h2 className="text-lg font-semibold text-foreground mb-6">Settings</h2>
        
        <div className="space-y-6">
          <div>
            <Label className="text-sm font-medium text-foreground mb-3 block">
              Focus Duration
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={focusDuration}
                onValueChange={setFocusDuration}
                min={15}
                max={60}
                step={5}
                className="flex-1"
                data-testid="slider-focus-duration"
              />
              <span className="text-sm text-muted-foreground w-12">
                {focusDuration[0]}m
              </span>
            </div>
          </div>
          
          <div>
            <Label className="text-sm font-medium text-foreground mb-3 block">
              Break Duration
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={breakDuration}
                onValueChange={setBreakDuration}
                min={3}
                max={15}
                step={1}
                className="flex-1"
                data-testid="slider-break-duration"
              />
              <span className="text-sm text-muted-foreground w-12">
                {breakDuration[0]}m
              </span>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <Label className="text-sm font-medium text-foreground">
                Notifications
              </Label>
              <span className="text-xs text-muted-foreground">
                {notificationPermission === "granted" ? "✓ Enabled" : 
                 notificationPermission === "denied" ? "✗ Blocked" : 
                 "Click to enable"}
              </span>
            </div>
            <Switch
              checked={settings.notifications}
              onCheckedChange={(checked) => {
                onUpdateSettings({ notifications: checked });
                if (checked) {
                  onRequestNotifications();
                }
              }}
              data-testid="switch-notifications"
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-foreground">
              Auto-start Breaks
            </Label>
            <Switch
              checked={settings.autoStartBreaks}
              onCheckedChange={(checked) => 
                onUpdateSettings({ autoStartBreaks: checked })
              }
              data-testid="switch-auto-start"
            />
          </div>
        </div>
        
        <Button
          className="w-full mt-8 transition-colors active:scale-95"
          onClick={handleSave}
          data-testid="button-save-settings"
        >
          Done
        </Button>
      </div>
    </div>
  );
}
