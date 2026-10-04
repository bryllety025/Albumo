// Talks to albumo-backend's public events endpoint to confirm a slug
// corresponds to a real event before proxy.ts trusts it enough to register
// this device to it via a cookie.

const EVENTS_API_URL = process.env.EVENTS_API_URL ?? "http://localhost:3000";

export type VerifiedEvent = {
  slug: string;
  eventName: string;
  /** The event's date, "YYYY-MM-DD". */
  date: string;
};

// Returns null for an unknown slug or any network/backend failure — callers
// treat those the same way: "not a valid entry link" rather than an error
// that should crash the request.
export async function verifyEventSlug(slug: string): Promise<VerifiedEvent | null> {
  try {
    const res = await fetch(`${EVENTS_API_URL}/events/public/${encodeURIComponent(slug)}`, {
      headers: { "x-api-key": process.env.EVENTS_API_KEY ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { slug: string; title: string; date: string };
    return { slug: data.slug, eventName: data.title, date: data.date };
  } catch (err) {
    console.error("Failed to verify event slug against albumo-backend:", err);
    return null;
  }
}

// The admin-configured max photos/videos a single device may upload per
// event (see albumo-backend's settings table). Falls back to this default —
// never throws — so an admin's backend being unreachable degrades to the old
// fixed behaviour instead of breaking the camera.
const FALLBACK_PHOTO_LIMIT = 20;

export async function fetchPhotoLimit(): Promise<number> {
  try {
    const res = await fetch(`${EVENTS_API_URL}/settings/guest-app`, {
      headers: { "x-api-key": process.env.EVENTS_API_KEY ?? "" },
      // Re-read at most once a minute: an admin's change should show up
      // without a deploy, but every page load doesn't need its own request.
      next: { revalidate: 60 },
    });
    if (!res.ok) return FALLBACK_PHOTO_LIMIT;

    const data = (await res.json()) as { photoLimitPerDevice: number };
    return Number.isInteger(data.photoLimitPerDevice) && data.photoLimitPerDevice > 0
      ? data.photoLimitPerDevice
      : FALLBACK_PHOTO_LIMIT;
  } catch (err) {
    console.error("Failed to read the photo limit from albumo-backend:", err);
    return FALLBACK_PHOTO_LIMIT;
  }
}

// Tells albumo-backend who uploaded a file, so the event owner can see it in
// their dashboard, and records this device's uploaderToken against it so it
// can later prove ownership to delete it (see deleteGuestUpload below).
// Best-effort and never throws -- the photo is already saved to S3 by the
// time this runs, so a failure here shouldn't undo the upload.
export async function registerUpload(
  slug: string,
  name: string,
  uploaderName?: string,
  uploaderToken?: string
): Promise<void> {
  try {
    const res = await fetch(`${EVENTS_API_URL}/events/public/${encodeURIComponent(slug)}/media`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.EVENTS_API_KEY ?? "",
      },
      body: JSON.stringify({
        name,
        uploaderName: uploaderName || undefined,
        uploaderToken: uploaderToken || undefined,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`Failed to register uploader name with albumo-backend: ${res.status}`);
    }
  } catch (err) {
    console.error("Failed to register uploader name with albumo-backend:", err);
  }
}

// Asks albumo-backend to delete a guest's own upload. Unlike registerUpload,
// this is NOT best-effort: it's the authorization gate for the delete, so a
// false here must stop the caller from touching S3. Returns false both when
// the backend refuses (token doesn't match this file's uploader) and on any
// network/server failure -- the caller treats those the same way: don't delete.
export async function deleteGuestUpload(
  slug: string,
  name: string,
  uploaderToken: string
): Promise<boolean> {
  try {
    const query = new URLSearchParams({ name, uploaderToken });
    const res = await fetch(
      `${EVENTS_API_URL}/events/public/${encodeURIComponent(slug)}/media?${query.toString()}`,
      {
        method: "DELETE",
        headers: { "x-api-key": process.env.EVENTS_API_KEY ?? "" },
        cache: "no-store",
      }
    );
    return res.ok;
  } catch (err) {
    console.error("Failed to delete guest upload via albumo-backend:", err);
    return false;
  }
}
