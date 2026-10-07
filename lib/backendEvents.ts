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

// The max photos/videos a single device may upload to this event: either the
// event's own photo-limit tier's limit, or (no such tier -- the usual case
// before tiers existed, or while the account has none) the account-wide
// default. Falls back to this constant -- never throws -- so albumo-backend
// being unreachable degrades to the old fixed behaviour instead of breaking
// the camera.
const FALLBACK_PHOTO_LIMIT = 20;

// Deliberately a fresh call per page load (re-read at most once a minute),
// not baked into the `albumo_event` cookie alongside slug/eventName/date:
// that cookie is set once, at proxy-time, and kept for up to a year, so a
// value this likely to change (an admin edits the tier, or the event's tier
// itself) would go stale for the cookie's whole lifetime if stored there.
//
// Returns null for "unlimited" (the tier, or the account-wide default, has
// no cap) -- a deliberate, meaningful value, unlike the FALLBACK_PHOTO_LIMIT
// degrade below, which only ever means "couldn't tell, assume the old fixed
// default" (an unreachable backend or a malformed response).
export async function fetchEventPhotoLimit(slug: string): Promise<number | null> {
  try {
    const res = await fetch(`${EVENTS_API_URL}/events/public/${encodeURIComponent(slug)}`, {
      headers: { "x-api-key": process.env.EVENTS_API_KEY ?? "" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return FALLBACK_PHOTO_LIMIT;

    const data = (await res.json()) as { photoLimitPerDevice: number | null };
    if (data.photoLimitPerDevice === null) return null;
    return Number.isInteger(data.photoLimitPerDevice) && data.photoLimitPerDevice > 0
      ? data.photoLimitPerDevice
      : FALLBACK_PHOTO_LIMIT;
  } catch (err) {
    console.error("Failed to read the photo limit from albumo-backend:", err);
    return FALLBACK_PHOTO_LIMIT;
  }
}

/**
 * An admin's upload policy for an event. `automatic` (the default) restricts
 * uploads to the event's own day; `disabled` blocks them outright no matter
 * the date; `always_open` allows them no matter the date.
 */
export type UploadsMode = "automatic" | "disabled" | "always_open";

// Not cookie-baked (same reasoning as fetchEventPhotoLimit above) and,
// unlike that one, not even revalidate-cached -- an admin's pause/resume
// decision needs to show up the moment a guest next opens the app, not up to
// a minute late, so this is a fully live `no-store` read on every open. Fails
// open to "automatic" (the original design) so albumo-backend being
// unreachable degrades to the date-based cutoff rather than either locking
// every guest out or throwing the gate open over a network blip.
export async function fetchEventUploadsMode(slug: string): Promise<UploadsMode> {
  try {
    const res = await fetch(`${EVENTS_API_URL}/events/public/${encodeURIComponent(slug)}`, {
      headers: { "x-api-key": process.env.EVENTS_API_KEY ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return "automatic";

    const data = (await res.json()) as { uploadsMode?: UploadsMode };
    return data.uploadsMode === "disabled" || data.uploadsMode === "always_open" ? data.uploadsMode : "automatic";
  } catch (err) {
    console.error("Failed to read the uploads mode from albumo-backend:", err);
    return "automatic";
  }
}

// Not per-event (unlike the fetches above): this is an account-wide setting,
// so it's always the same call regardless of which event's link the guest
// opened. `no-store` since an admin should be able to add/remove the link
// and have it show up on the next page load, not wait on a cache. Returns
// null (never throws) both when the backend is unreachable and when no
// admin has set a link yet -- callers treat the two the same way: don't show
// the prompt.
export async function fetchGuestAppFacebookUrl(): Promise<string | null> {
  try {
    const res = await fetch(`${EVENTS_API_URL}/settings/guest-app`, {
      headers: { "x-api-key": process.env.EVENTS_API_KEY ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { facebookUrl?: string };
    return data.facebookUrl || null;
  } catch (err) {
    console.error("Failed to read the Facebook link from albumo-backend:", err);
    return null;
  }
}

export type RegisterUploadResult =
  | { ok: true }
  | { ok: false; reason: "guest_limit_reached" }
  | { ok: false; reason: "uploads_disabled" };

// Tells albumo-backend who uploaded a file, so the event owner can see it in
// their dashboard, and records this device's uploaderToken against it so it
// can later prove ownership to delete it (see deleteGuestUpload below).
// Best-effort for every failure except one: a 409 means the event has a
// guest-limit tier and this is a brand-new device arriving after it was
// already reached, which albumo-backend has already undone (it deletes the S3 object
// it would otherwise orphan) -- that specific case must reach the caller so
// the guest can be told, rather than being silently swallowed like a
// transient network blip would be (where undoing an upload that's already in
// S3 would be the wrong call).
export async function registerUpload(
  slug: string,
  name: string,
  uploaderName?: string,
  uploaderToken?: string
): Promise<RegisterUploadResult> {
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
    if (res.status === 409) {
      return { ok: false, reason: "guest_limit_reached" };
    }
    if (res.status === 403) {
      return { ok: false, reason: "uploads_disabled" };
    }
    if (!res.ok) {
      console.error(`Failed to register uploader name with albumo-backend: ${res.status}`);
    }
    return { ok: true };
  } catch (err) {
    console.error("Failed to register uploader name with albumo-backend:", err);
    return { ok: true };
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
