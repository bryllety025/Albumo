// A guest is asked for their name once per device, like the existing photo
// count/history keys in lib/photoStorage.ts. `null` means "never asked yet";
// an empty string means they were asked and skipped.
const GUEST_NAME_KEY = "wedding-guest-name";

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
}
