import { useState, useEffect } from "react";
import { Bell, Clock, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import type { PomodoroSettings } from "@/hooks/use-pomodoro-timer";

interface SettingsPanelProps {
  isOpen: boolean;
  settings: PomodoroSettings;
  notificationPermission: NotificationPermission;
  notificationsSupported?: boolean;
  onClose: () => void;
  onUpdateSettings: (settings: Partial<PomodoroSettings>) => void;
  onRequestNotifications: () => void;
}

function PermissionStatus({
  permission,
  enabled,
}: {
  permission: NotificationPermission;
  enabled: boolean;
}) {
  if (!enabled) {
    return (
      <span
        className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        data-testid="notification-status-off"
      >
        Off
      </span>
    );
  }

  if (permission === "granted") {
    return (
      <span
        className="inline-flex items-center rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary"
        data-testid="notification-status-on"
      >
        Active
      </span>
    );
  }

  if (permission === "denied") {
    return (
      <span
        className="inline-flex items-center rounded-md bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive"
        data-testid="notification-status-blocked"
      >
        Blocked
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
      data-testid="notification-status-pending"
    >
      Needs permission
    </span>
  );
}

export function SettingsPanel({
  isOpen,
  settings,
  notificationPermission,
  notificationsSupported = true,
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

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

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
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      data-testid="settings-panel"
    >
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        data-testid="settings-overlay"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className={`relative z-10 flex w-full max-h-[90vh] flex-col border border-border bg-card shadow-xl transition-all duration-300 rounded-t-3xl sm:max-w-sm sm:rounded-2xl ${
          isOpen ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 sm:translate-y-4"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-12 shrink-0 rounded-full bg-muted sm:hidden" />

        <div className="overflow-y-auto p-6 pt-4 sm:pt-6">
          <div className="mb-6">
            <h2
              id="settings-title"
              className="text-lg font-semibold text-foreground"
            >
              Settings
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tune session lengths and how you’re alerted when time’s up.
            </p>
          </div>

          <div className="space-y-6">
            <section className="space-y-4" aria-labelledby="settings-timer-heading">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-primary" aria-hidden="true" />
                <h3
                  id="settings-timer-heading"
                  className="text-sm font-semibold text-foreground"
                >
                  Timer
                </h3>
              </div>

              <div>
                <Label className="mb-3 block text-sm font-medium text-foreground">
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
                  <span className="w-12 text-sm text-muted-foreground tabular-nums">
                    {focusDuration[0]}m
                  </span>
                </div>
              </div>

              <div>
                <Label className="mb-3 block text-sm font-medium text-foreground">
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
                  <span className="w-12 text-sm text-muted-foreground tabular-nums">
                    {breakDuration[0]}m
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 flex-col">
                  <Label
                    htmlFor="switch-auto-start"
                    className="text-sm font-medium text-foreground"
                  >
                    Auto-start Breaks
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    Begin a break as soon as focus ends
                  </span>
                </div>
                <Switch
                  id="switch-auto-start"
                  checked={settings.autoStartBreaks}
                  onCheckedChange={(checked) =>
                    onUpdateSettings({ autoStartBreaks: checked })
                  }
                  data-testid="switch-auto-start"
                />
              </div>
            </section>

            <Separator />

            <section
              className="space-y-4"
              aria-labelledby="settings-notifications-heading"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h3
                    id="settings-notifications-heading"
                    className="text-sm font-semibold text-foreground"
                  >
                    Notifications
                  </h3>
                </div>
                {notificationsSupported && (
                  <PermissionStatus
                    permission={notificationPermission}
                    enabled={settings.notifications}
                  />
                )}
              </div>

              {notificationsSupported ? (
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <Label
                        htmlFor="switch-notifications"
                        className="text-sm font-medium text-foreground"
                      >
                        Desktop notifications
                      </Label>
                      <span className="text-xs leading-relaxed text-muted-foreground">
                        {!settings.notifications
                          ? "Get a system alert when a focus or break session finishes — even in another tab."
                          : notificationPermission === "granted"
                            ? "You’ll get a system alert when a focus or break session finishes — even in another tab."
                            : notificationPermission === "denied"
                              ? "Blocked in your browser. Allow notifications for this site, then turn this back on."
                              : "Allow browser alerts so you’re notified when the timer finishes."}
                      </span>
                    </div>
                    <Switch
                      id="switch-notifications"
                      checked={settings.notifications}
                      onCheckedChange={(checked) => {
                        onUpdateSettings({ notifications: checked });
                        if (checked && notificationPermission !== "denied") {
                          onRequestNotifications();
                        }
                      }}
                      data-testid="switch-notifications"
                    />
                  </div>
                </div>
              ) : (
                <p
                  className="rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground"
                  data-testid="notifications-unsupported"
                >
                  This browser doesn’t support desktop notifications.
                </p>
              )}

              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  A short chime still plays in the app when a session ends,
                  whether desktop notifications are on or off.
                </span>
              </div>
            </section>
          </div>
        </div>

        <div className="shrink-0 border-t border-border p-4 sm:p-6">
          <Button
            className="w-full transition-colors active:scale-95"
            onClick={handleSave}
            data-testid="button-save-settings"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
