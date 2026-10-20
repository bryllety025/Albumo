// A guest is asked for their name once per device, like the existing photo
// count/history keys in lib/photoStorage.ts. `null` means "never asked yet";
// an empty string means they were asked and skipped.
const GUEST_NAME_KEY = "wedding-guest-name";

// Fired on window each time the name is set (saved or skipped), so the "How to
// use" walkthrough can wait for a first-time guest to deal with the name prompt
// before opening on top of it.
export const GUEST_NAME_SET_EVENT = "wedding-guest-name-set";

export function getStoredGuestName(): string | null {
  try {
    return localStorage.getItem(GUEST_NAME_KEY);
  } catch {
    return null;
  }
}

export function setStoredGuestName(name: string): void {
  try {
    localStorage.setItem(GUEST_NAME_KEY, name);
  } catch {
    // Storage unavailable (e.g. Safari private mode) — the modal just won't
    // remember the choice across reloads.
  }
  window.dispatchEvent(new Event(GUEST_NAME_SET_EVENT));
}
