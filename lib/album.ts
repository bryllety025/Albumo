// What the guest app knows about an event's albums. The album itself is drawn by the event owner's browser,
// which sends a picture of each page to albumo-backend; the guest app only lists those albums (see
// fetchEventAlbums) and shows their pages (see app/api/album).

/** An album as the guests see it. */
export type GuestAlbum = {
  id: string;
  title: string;
  /** Pages in all, covers included. */
  pageCount: number;
  /** When its pages were published, an ISO date. */
  publishedAt: string;
};

/** An album's id as albumo-backend makes it: a UUID. Joined onto a bucket key, so it is checked first. */
export const ALBUM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The most pages an album has: up to 40 photo pages and the two covers. */
export const MAX_ALBUM_PAGES = 42;

/**
 * Where a page's picture is served from. Page 0 is the cover. `publishedAt` only makes the address change if
 * the pages ever do, which is what lets the picture be cached for good. `attempt` counts the times it has
 * been asked for again after failing.
 */
export function albumPageUrl(albumId: string, index: number, publishedAt: string, attempt = 0): string {
  const version = Date.parse(publishedAt);
  const query = new URLSearchParams();
  if (Number.isFinite(version)) query.set("v", String(version));
  // Asking again after a failure must not be answered from what the browser remembers of the failure.
  if (attempt > 0) query.set("r", String(attempt));
  const text = query.toString();
  return `/api/album/${albumId}/${index}${text ? `?${text}` : ""}`;
}
