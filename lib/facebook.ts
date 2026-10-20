/**
 * Where a "follow us" button should send a guest, from the link an admin set in
 * Settings. That one setting is shared with the owner dashboard's "Need
 * support?" prompt, which works best with a Messenger link (m.me/<page>) -- but
 * Messenger can't be followed, so a plain m.me/<page> is turned into the
 * facebook.com page it belongs to. Anything else (a facebook.com link, or an
 * m.me link that isn't a single page, such as a group invite) is used as the
 * admin wrote it, the same as the "Follow us on Facebook" link at the bottom of
 * the page.
 */
export function facebookFollowUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.protocol === "https:" && host === "m.me" && segments.length === 1) {
    return `https://www.facebook.com/${segments[0]}`;
  }
  return raw;
}
