// Talks to albumo-backend's public events endpoint to confirm a slug
// corresponds to a real event before proxy.ts trusts it enough to register
// this device to it via a cookie.

import { ALBUM_ID_PATTERN, MAX_ALBUM_PAGES, type GuestAlbum } from "./album";

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

/**
 * How full an event's album is: `limit` is the most photos/videos the whole
 * event may hold from its guests (across every device), `used` how many it
 * holds right now. A null `limit` means the event has no cap.
 */
export type PhotoQuota = { limit: number | null; used: number };

// The event's own photo-limit tier's limit, or (no such tier -- the usual
// case before tiers existed, or while the account has none) the account-wide
// default, plus how many photos the event holds right now. albumo-backend
// enforces the limit when an upload is registered; this is what lets the
// camera show it, and stop offering to take a photo that would only be
// refused.
//
// Fully live (`no-store`), unlike what used to be a once-a-minute read of
// the limit alone: `used` moves with every guest's upload, and an admin
// editing the limit should show on the next open too. Not baked into the
// `albumo_event` cookie either -- that is set once, at proxy-time, and kept
// for up to a year.
//
// Never throws. When albumo-backend can't be reached or answers with
// something unreadable, the answer is "no cap, nothing used yet": the
// limit is enforced server-side regardless, so the worst case is a guest
// being told it's full only when an upload is actually refused -- far better
// than a phantom cap that locks the camera for an event that isn't full.
export async function fetchEventPhotoQuota(slug: string): Promise<PhotoQuota> {
  const unknown: PhotoQuota = { limit: null, used: 0 };
  try {
    const res = await fetch(`${EVENTS_API_URL}/events/public/${encodeURIComponent(slug)}`, {
      headers: { "x-api-key": process.env.EVENTS_API_KEY ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return unknown;

    const data = (await res.json()) as { photoLimit?: number | null; photoCount?: number };
    const limit = Number.isInteger(data.photoLimit) && (data.photoLimit as number) > 0 ? (data.photoLimit as number) : null;
    const used = Number.isInteger(data.photoCount) && (data.photoCount as number) >= 0 ? (data.photoCount as number) : 0;
    return { limit, used };
  } catch (err) {
    console.error("Failed to read the photo limit from albumo-backend:", err);
    return unknown;
  }
}

/**
 * An admin's upload policy for an event. `automatic` (the default) follows
 * the event's date -- camera and camera roll on its own day, camera roll only
 * for a few days after (see lib/manilaDate.ts); `disabled` blocks uploads
 * outright no matter the date; `always_open` allows them no matter the date.
 */
export type UploadsMode = "automatic" | "disabled" | "always_open";

// Not cookie-baked (same reasoning as fetchEventPhotoQuota above) and,
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

// The albums the event owner has saved and shared, oldest first. Live `no-store`, like the uploads mode: the
// album should be on the guest page the next time a guest opens it, not up to a minute later. Returns an empty
// list (never throws) when there are none and when the backend can't be reached -- the guest app just doesn't
// show an album then. Each entry is checked before it is trusted: its id ends up in a bucket key.
export async function fetchEventAlbums(slug: string): Promise<GuestAlbum[]> {
  try {
    const res = await fetch(`${EVENTS_API_URL}/events/public/${encodeURIComponent(slug)}/albums`, {
      headers: { "x-api-key": process.env.EVENTS_API_KEY ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { items?: unknown };
    if (!Array.isArray(data.items)) return [];

    const albums: GuestAlbum[] = [];
    for (const item of data.items as Record<string, unknown>[]) {
      const { id, title, pageCount, publishedAt } = item ?? {};
      if (
        typeof id === "string" && ALBUM_ID_PATTERN.test(id) &&
        typeof pageCount === "number" && Number.isInteger(pageCount) && pageCount >= 2 && pageCount <= MAX_ALBUM_PAGES &&
        typeof publishedAt === "string" && Number.isFinite(Date.parse(publishedAt))
      ) {
        albums.push({ id, title: typeof title === "string" ? title.trim().slice(0, 80) : "", pageCount, publishedAt });
      }
    }
    return albums;
  } catch (err) {
    console.error("Failed to read the albums from albumo-backend:", err);
    return [];
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
  /** `photoCount` is how many photos the event holds now, this one included -- null if albumo-backend didn't say. */
  | { ok: true; photoCount: number | null }
  | { ok: false; reason: "guest_limit_reached" }
  | { ok: false; reason: "photo_limit_reached" }
  | { ok: false; reason: "uploads_disabled" };

// Tells albumo-backend who uploaded a file, so the event owner can see it in
// their dashboard, and records this device's uploaderToken against it so it
// can later prove ownership to delete it (see deleteGuestUpload below).
// Best-effort for every failure except the ones that mean the upload was
// refused: a 409 means either the event has a guest-limit tier and this is a
// brand-new device arriving after it was already reached, or the event
// already holds as many photos as its photo limit allows (told apart by the
// body's `code`). albumo-backend has already undone the upload in both cases
// (it deletes the S3 object it would otherwise orphan) -- they must reach the
// caller so the guest can be told, rather than being silently swallowed like
// a transient network blip would be (where undoing an upload that's already
// in S3 would be the wrong call).
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
      const body = (await res.json().catch(() => null)) as { code?: string } | null;
      return { ok: false, reason: body?.code === "photo_limit_reached" ? "photo_limit_reached" : "guest_limit_reached" };
    }
    if (res.status === 403) {
      return { ok: false, reason: "uploads_disabled" };
    }
    if (!res.ok) {
      console.error(`Failed to register uploader name with albumo-backend: ${res.status}`);
      return { ok: true, photoCount: null };
    }
    const body = (await res.json().catch(() => null)) as { photoCount?: number } | null;
    const photoCount = Number.isInteger(body?.photoCount) ? (body?.photoCount as number) : null;
    return { ok: true, photoCount };
  } catch (err) {
    console.error("Failed to register uploader name with albumo-backend:", err);
    return { ok: true, photoCount: null };
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
