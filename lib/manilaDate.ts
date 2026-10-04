// Every event this app serves happens in the Philippines, but the server
// (and a guest's own phone, if its clock is set to a different region) may
// not be in that timezone. Pinning "today" to Asia/Manila explicitly keeps
// the server and every guest's device agreeing on the same calendar day,
// rather than drifting near midnight depending on where each one thinks it is.
const MANILA_TIME_ZONE = "Asia/Manila";

// en-CA formats as YYYY-MM-DD, matching the date-only strings albumo-backend
// stores and returns (e.g. an event's `date`).
const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TIME_ZONE });

/** Today's date in the Philippines, "YYYY-MM-DD". */
export function todayInManila(): string {
  return formatter.format(new Date());
}

/** Whether `date` (a "YYYY-MM-DD" string, e.g. an event's date) is today in the Philippines. */
export function isTodayInManila(date: string): boolean {
  return date === todayInManila();
}
