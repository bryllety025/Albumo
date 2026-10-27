// The most photos a guest can pick from their camera roll in one go. The phone decodes every picked photo in full
// to make its thumbnail, and the review screen shows them all, so a big batch of large photos (30 or 40 at once)
// runs a phone out of memory and some of them come back as "couldn't be processed". Photos picked after this one
// are queued behind the first batch, so a guest can simply pick again straight away.
export const MAX_PHOTOS_PER_UPLOAD = 5;

// A web page can't make the phone's own photo picker stop at a number, so the only way to stop a guest from ticking
// 30 photos (and then being told only 5 can go) is to say so BEFORE the picker opens. That is asked each time a guest
// taps "Choose Photo" until they have saved a pick that was within the limit on this device: from then on they know,
// and the button's own label ("Upload up to 5 ...") is enough.
const KNOWS_LIMIT_KEY = "wedding-pick-limit-known";

export function knowsPickLimit(): boolean {
  try {
    return localStorage.getItem(KNOWS_LIMIT_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberPickLimit(): void {
  try {
    localStorage.setItem(KNOWS_LIMIT_KEY, "1");
  } catch {
    // Storage unavailable (e.g. Safari private mode): the notice is simply shown again next time.
  }
}
