"use client";

import { useEffect, useState } from "react";
import {
  registerServiceWorker,
  requestNotificationPermission,
  updatePhotoCountNotification,
  isIosNotInstalled,
} from "@/lib/notifications";
import { getStoredCount, PHOTO_LIMIT } from "@/lib/photoStorage";

type Status = "unsupported" | "ios-not-installed" | "idle" | "granted" | "denied";

export default function NotificationToggle() {
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }
    if (isIosNotInstalled()) {
      setStatus("ios-not-installed");
      return;
    }
    if (Notification.permission === "granted") {
      setStatus("granted");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    (async () => {
      await registerServiceWorker();
      const granted = await requestNotificationPermission();
      if (granted) {
        setStatus("granted");
        const remaining = Math.max(PHOTO_LIMIT - getStoredCount(), 0);
        updatePhotoCountNotification(remaining);
      } else {
        setStatus("denied");
      }
    })();
  }, []);

  if (status === "ios-not-installed") {
    return (
      <p className="max-w-xs text-center text-xs text-gray-500">
        Add this to your Home Screen (Share → Add to Home Screen), then come
        back to enable lock-screen updates.
      </p>
    );
  }

  return null;
}
