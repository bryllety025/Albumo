"use client";

import { useEffect, useState } from "react";
import {
  registerServiceWorker,
  requestNotificationPermission,
  updatePhotoCountNotification,
  isIosNotInstalled,
} from "@/lib/notifications";
import { getStoredCount } from "@/lib/photoStorage";

type Status = "unsupported" | "ios-not-installed" | "idle" | "granted" | "denied";

type Props = {
  eventName: string;
  /** Null means the event has no photo limit. */
  photoLimit: number | null;
};

export default function NotificationToggle({ eventName, photoLimit }: Props) {
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
        const remaining = photoLimit === null ? null : Math.max(photoLimit - getStoredCount(), 0);
        updatePhotoCountNotification(remaining, eventName);
      } else {
        setStatus("denied");
      }
    })();
  }, [eventName, photoLimit]);

  if (status === "ios-not-installed") {
    return (
      <p className="mt-4 max-w-xs shrink-0 text-center text-xs text-gray-500">
        Add this to your Home Screen (Share → Add to Home Screen), then come
        back to enable lock-screen updates.
      </p>
    );
  }

  return null;
}
