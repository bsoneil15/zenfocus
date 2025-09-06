import { useState, useEffect, useCallback } from "react";

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported("Notification" in window);
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
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
      if (!isSupported || permission !== "granted") return;

      try {
        const notification = new Notification(title, {
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          ...options,
        });

        // Auto-close notification after 5 seconds
        const timeoutId = setTimeout(() => {
          notification.close();
        }, 5000);

        // Clean up timeout if notification is closed manually
        notification.addEventListener('close', () => {
          clearTimeout(timeoutId);
        });

        return notification;
      } catch (error) {
        console.error("Failed to show notification:", error);
      }
    },
    [isSupported, permission]
  );

  const showTimerNotification = useCallback(
    (isBreak: boolean) => {
      const title = "🍅 Focus Flow - Pomodoro Timer";
      const body = isBreak 
        ? "✨ Break time! Step away and recharge." 
        : "🎯 Focus session complete! Time for a well-deserved break.";
      
      return showNotification(title, {
        body,
        tag: "pomodoro-timer",
        requireInteraction: true,
        silent: false,
        data: { sessionType: isBreak ? "break" : "focus" }
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
