// Every event this app serves happens in the Philippines, but the server
// (and a guest's own phone, if its clock is set to a different region) may
// not be in that timezone. Pinning "today" to Asia/Manila explicitly keeps
// the server and every guest's device agreeing on the same calendar day,
// rather than drifting near midnight depending on where each one thinks it is.
const MANILA_TIME_ZONE = "Asia/Manila";

// en-CA formats as YYYY-MM-DD, matching the date-only strings albumo-backend
// stores and returns (e.g. an event's `date`).
const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TIME_ZONE });

const MS_PER_DAY = 86_400_000;

/**
 * How many days after the event's own day guests may still add photos from
 * their camera roll (the camera itself closes when the day ends). Mirrored by
 * albumo-backend (common/utils/manila-date.ts), which enforces it on upload.
 */
export const LATE_UPLOAD_DAYS = 3;

/** Today's date in the Philippines, "YYYY-MM-DD". */
export function todayInManila(): string {
  return formatter.format(new Date());
}

// A "YYYY-MM-DD" date as a whole day count, so two dates subtract cleanly (UTC, so no DST/offset shift).
function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

/** How many days the Philippines' calendar is past `date`: 0 on the day itself, 1 the day after, negative before it. */
export function daysSinceInManila(date: string): number {
  return dayNumber(todayInManila()) - dayNumber(date);
}

/**
 * Where an event's own date puts guest uploads right now: `upcoming` (the day hasn't arrived), `event_day`
 * (camera and camera roll), `after_event` (camera roll only, for LATE_UPLOAD_DAYS days), then `closed`.
 */
export type UploadWindow = "upcoming" | "event_day" | "after_event" | "closed";

export function uploadWindow(date: string): UploadWindow {
  const days = daysSinceInManila(date);
  if (days < 0) return "upcoming";
  if (days === 0) return "event_day";
  // A malformed date gives NaN, which fails this too -- closed, not open.
  return days <= LATE_UPLOAD_DAYS ? "after_event" : "closed";
}

/** The last day uploads are accepted for an event on `date`, "YYYY-MM-DD". */
export function lastUploadDay(date: string): string {
  return new Date((dayNumber(date) + LATE_UPLOAD_DAYS) * MS_PER_DAY).toISOString().slice(0, 10);
}
