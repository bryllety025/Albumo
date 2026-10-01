// An opaque id for this device/browser, generated once and kept in
// localStorage like the guest name and photo count. Sent along with every
// upload so the backend can later prove this same device owns a photo
// before letting it delete one — see lib/backendEvents.ts's registerUpload
// and deleteGuestUpload.
const TOKEN_KEY = "wedding-photos-uploader-token";

export function getOrCreateUploaderToken(): string {
  try {
    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing) return existing;
    const token = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch {
    // Storage unavailable (e.g. Safari private mode) — uploads this session
    // still get a token, it just won't be remembered across reloads, so
    // photos saved before a reload can no longer be deleted after one.
    return crypto.randomUUID();
  }
}
