"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
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
    if (Notification.permission === "granted") setStatus("granted");
    else if (Notification.permission === "denied") setStatus("denied");
  }, []);

  const handleClick = useCallback(async () => {
    await registerServiceWorker();
    const granted = await requestNotificationPermission();
    if (granted) {
      setStatus("granted");
      const remaining = Math.max(PHOTO_LIMIT - getStoredCount(), 0);
      updatePhotoCountNotification(remaining);
    } else {
      setStatus("denied");
    }
  }, []);

  if (status === "unsupported" || status === "granted") return null;

  if (status === "ios-not-installed") {
    return (
      <p className="max-w-xs text-center text-xs text-sage-600">
        Add this to your Home Screen (Share → Add to Home Screen), then come
        back to enable lock-screen updates.
      </p>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === "denied"}
      className="inline-flex items-center gap-2 rounded-full bg-sage-100 px-5 py-2.5 text-sm font-medium text-sage-900 transition-colors hover:bg-sage-100/70 disabled:opacity-50"
    >
      <Bell size={18} strokeWidth={1.75} />
      {status === "denied" ? "Notifications blocked" : "Get Lock-Screen Updates"}
    </button>
  );
}
