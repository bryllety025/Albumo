const SW_URL = "/sw.js";

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_URL);
  } catch {
    return null;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export async function updatePhotoCountNotification(remaining: number): Promise<void> {
  if (!("serviceWorker" in navigator) || Notification.permission !== "granted") return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification("Ellen and Brylle Wedding", {
      body:
        remaining > 0
          ? `${remaining} photo${remaining === 1 ? "" : "s"} left tonight`
          : "Photo limit reached — thank you!",
      icon: "/icons/icon-192.png",
      tag: "photo-count",
      silent: true,
    });
  } catch {
    // Notifications unavailable/blocked mid-session — safe to ignore.
  }
}

export function isIosNotInstalled(): boolean {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return isIOS && !isStandalone;
}
