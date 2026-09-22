import { useState, useEffect, useCallback } from "react";
import type { TimerMode } from "@/hooks/use-pomodoro-timer";

const NOTIFICATION_ICON = "/notification-icon.png";
const NOTIFICATION_TAG = "pomodoro-timer";

function getNotificationAbsoluteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  try {
    return new URL(path, window.location.origin).toString();
  } catch {
    return path;
  }
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    const supported = typeof window !== "undefined" && "Notification" in window;
    setIsSupported(supported);
    if (!supported) return;

    setPermission(Notification.permission);

    // Stay in sync if the user changes permission in browser settings.
    const syncPermission = () => setPermission(Notification.permission);
    document.addEventListener("visibilitychange", syncPermission);
    window.addEventListener("focus", syncPermission);
    return () => {
      document.removeEventListener("visibilitychange", syncPermission);
      window.removeEventListener("focus", syncPermission);
    };
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === "granted";
    } catch (error) {
      console.error("Failed to request notification permission:", error);
      return false;
    }
  }, [isSupported]);

  const showNotification = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (!isSupported || Notification.permission !== "granted") return;

      try {
        // Prefer the live permission check so we still notify if React state
        // is briefly stale after the user grants access.
        const notification = new Notification(title, {
          icon: getNotificationAbsoluteUrl(NOTIFICATION_ICON),
          badge: getNotificationAbsoluteUrl(NOTIFICATION_ICON),
          ...options,
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
        };

        // Keep on-screen long enough to notice when returning from another tab.
        // requireInteraction is intentionally left to the caller.
        if (!options?.requireInteraction) {
          const timeoutId = window.setTimeout(() => {
            notification.close();
          }, 8000);

          notification.addEventListener("close", () => {
            window.clearTimeout(timeoutId);
          });
        }

        return notification;
      } catch (error) {
        console.error("Failed to show notification:", error);
      }
    },
    [isSupported]
  );

  const showTimerNotification = useCallback(
    (completedMode: TimerMode) => {
      const title =
        completedMode === "focus"
          ? "Focus session complete"
          : "Break complete";
      const body =
        completedMode === "focus"
          ? "Nice work — time for a break."
          : "Ready to focus again?";

      return showNotification(title, {
        body,
        tag: `${NOTIFICATION_TAG}-${completedMode}-${Date.now()}`,
        requireInteraction: true,
        silent: false,
        data: { completedMode },
      });
    },
    [showNotification]
  );

  return {
    permission,
    isSupported,
    requestPermission,
    showNotification,
    showTimerNotification,
  };
}
