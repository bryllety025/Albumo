// The "How to use" walkthrough opens by itself the first time a guest opens
// the app on a device, like the name prompt in lib/guestName.ts, and never
// again on its own. Anyone can still replay it from the link at the bottom of
// the page.
const HOW_TO_USE_SEEN_KEY = "wedding-how-to-use-seen";

export function hasSeenHowToUse(): boolean {
  try {
    return localStorage.getItem(HOW_TO_USE_SEEN_KEY) === "1";
  } catch {
    // Storage unavailable: the choice couldn't be remembered, so opening it
    // on every visit would just nag. Treat it as seen.
    return true;
  }
}

export function markHowToUseSeen(): void {
  try {
    localStorage.setItem(HOW_TO_USE_SEEN_KEY, "1");
  } catch {
    // Best-effort, same as the guest name.
  }
}
