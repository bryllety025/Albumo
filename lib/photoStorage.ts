export const PHOTO_LIMIT = 20;

const COUNT_KEY = "wedding-photos-count";
const LAST_PHOTO_KEY = "wedding-photos-last-photo"; // legacy, read-only now
const PHOTOS_KEY = "wedding-photos-history";

export function getStoredCount(): number {
  try {
    const raw = localStorage.getItem(COUNT_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export function incrementStoredCount(): number {
  const next = getStoredCount() + 1;
  try {
    localStorage.setItem(COUNT_KEY, String(next));
  } catch {
    // Storage unavailable (e.g. Safari private mode) — count still works
    // for the rest of this page load, it just won't persist across reloads.
  }
  return next;
}

export function getStoredPhotos(): string[] {
  try {
    const raw = localStorage.getItem(PHOTOS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((p): p is string => typeof p === "string");
      }
    }
    // One-time migration: seed from the old single-photo key so a device
    // that already saved a photo before this upgrade doesn't lose it.
    const legacy = localStorage.getItem(LAST_PHOTO_KEY);
    return legacy ? [legacy] : [];
  } catch {
    return [];
  }
}

export function addStoredPhoto(dataUrl: string): string[] {
  const next = [dataUrl, ...getStoredPhotos()].slice(0, PHOTO_LIMIT);
  try {
    localStorage.setItem(PHOTOS_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded/unavailable — `next` still drives state for this session.
  }
  return next;
}

export function createThumbnail(
  sourceUrl: string,
  maxDim = 640,
  quality = 0.72
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Failed to load image for thumbnail"));
    img.src = sourceUrl;
  });
}
