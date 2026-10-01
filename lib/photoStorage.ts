const COUNT_KEY = "wedding-photos-count";
const MY_PHOTOS_KEY = "wedding-photos-mine";

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

// Frees up a slot reserved by incrementStoredCount for an upload that was
// later abandoned (e.g. the guest gave up retrying a failed background upload).
export function decrementStoredCount(): number {
  const next = Math.max(getStoredCount() - 1, 0);
  try {
    localStorage.setItem(COUNT_KEY, String(next));
  } catch {
    // See incrementStoredCount — safe to ignore.
  }
  return next;
}

// One entry per photo this device has successfully uploaded, so the guest
// can look back at what they've shared and delete one if they want to
// retake it. `id` is the S3 key the upload returned — the same value the
// delete API route and the uploader-token check key off of.
export type MyPhoto = {
  id: string;
  thumbnail: string;
  uploadedAt: number;
};

export function getMyPhotos(): MyPhoto[] {
  try {
    const raw = localStorage.getItem(MY_PHOTOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is MyPhoto =>
        p &&
        typeof p.id === "string" &&
        typeof p.thumbnail === "string" &&
        typeof p.uploadedAt === "number"
    );
  } catch {
    return [];
  }
}

export function addMyPhoto(id: string, thumbnail: string): MyPhoto[] {
  const next = [
    { id, thumbnail, uploadedAt: Date.now() },
    ...getMyPhotos().filter((p) => p.id !== id),
  ];
  try {
    localStorage.setItem(MY_PHOTOS_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded/unavailable — `next` still drives state for this session.
  }
  return next;
}

export function removeMyPhoto(id: string): MyPhoto[] {
  const next = getMyPhotos().filter((p) => p.id !== id);
  try {
    localStorage.setItem(MY_PHOTOS_KEY, JSON.stringify(next));
  } catch {
    // See addMyPhoto — safe to ignore.
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
