import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchEventGuestSettingsCached, type EventGuestSettings, type VerifiedEvent } from "./backendEvents";
import { EVENT_COOKIE, encodeEventCookie, getCookieFromHeader } from "./event";

// An event owner can put a password on the event link. A guest who types it right is given this cookie, next to
// the `albumo_event` one that says which event the device belongs to (see lib/event.ts). It holds the password's
// "stamp" -- a value albumo-backend changes whenever the owner changes or removes the password -- and a signature
// over the event's slug and that stamp, made with a key only this server has. So:
//   - it can't be made up on a device, nor moved to another event;
//   - when the owner changes the password the stamp moves on and every device is asked again, with no list of
//     sessions to keep.
// An event with no password never needs it.
export const ACCESS_COOKIE = "albumo_access";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function sign(slug: string, stamp: string): string {
  return createHmac("sha256", process.env.EVENTS_API_KEY ?? "")
    .update(`albumo-access\n${slug}\n${stamp}`)
    .digest("base64url");
}

/** The cookie value for a guest who got `slug`'s password (whose stamp is `stamp`) right. */
export function accessCookieValue(slug: string, stamp: string): string {
  return `${stamp}.${sign(slug, stamp)}`;
}

function accessCookieIsValid(value: string | undefined, slug: string, stamp: string): boolean {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot < 1 || value.slice(0, dot) !== stamp) return false;

  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(slug, stamp));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Whether a guest holding `cookieValue` may see `slug`'s pages and photos right now. True for an event with no
 * password. `settings` is null when albumo-backend couldn't be asked, and then the guest gets in: whoever reached
 * this far was let in before (the event cookie is only set after the link, and its password, were accepted), and
 * a network blip must not lock a whole party out of their photos. The same blip stops a new device from getting
 * in at all, as proxy.ts can't verify the link.
 */
export function isUnlocked(settings: EventGuestSettings | null, slug: string, cookieValue: string | undefined): boolean {
  if (!settings || !settings.passwordProtected) return true;
  return accessCookieIsValid(cookieValue, slug, settings.passwordStamp ?? "0");
}

/** True for a device that already has the right to see this (protected) event's pages. For proxy.ts. */
export function hasAccess(event: VerifiedEvent, cookieValue: string | undefined): boolean {
  if (!event.passwordProtected) return true;
  return accessCookieIsValid(cookieValue, event.slug, event.passwordStamp ?? "0");
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: COOKIE_MAX_AGE_SECONDS,
};

/**
 * Registers this device to the event (and, if it has a password and the guest knew it, remembers that too).
 * Used where a guest gets in: proxy.ts for an open event, /api/unlock for a protected one.
 */
export function registerDevice(response: NextResponse, event: VerifiedEvent, unlockedStamp: string | null) {
  response.cookies.set(
    EVENT_COOKIE,
    encodeEventCookie({ slug: event.slug, eventName: event.eventName, date: event.date }),
    cookieOptions,
  );
  if (unlockedStamp) {
    response.cookies.set(ACCESS_COOKIE, accessCookieValue(event.slug, unlockedStamp), cookieOptions);
  }
}

/**
 * For a Server Component page of an event that is open to this device's cookie: sends a guest who hasn't
 * entered the password (or whose password was changed since) to the page that asks for it. Pass the settings
 * the page already fetched, so the backend isn't asked twice.
 */
export async function requireUnlocked(slug: string, settings: EventGuestSettings | null): Promise<void> {
  const store = await cookies();
  if (!isUnlocked(settings, slug, store.get(ACCESS_COOKIE)?.value)) {
    redirect(`/unlock/${encodeURIComponent(slug)}`);
  }
}

/**
 * For an API route: a response to send back instead of the data when this guest hasn't unlocked the event, or
 * null to carry on. 401 with a `code` the camera can recognise.
 */
export function lockedResponse(req: Request, slug: string, settings: EventGuestSettings | null): NextResponse | null {
  if (isUnlocked(settings, slug, getCookieFromHeader(req.headers.get("cookie"), ACCESS_COOKIE))) return null;
  return NextResponse.json(
    { error: "This event is password protected. Open its link and enter the password.", code: "password_required" },
    { status: 401 },
  );
}

/**
 * `lockedResponse` for an API route that has no settings of its own to hand: reads them (a few seconds old at
 * worst, see fetchEventGuestSettingsCached) so a page of thumbnails doesn't ask the backend once per photo.
 */
export async function guestGate(req: Request, slug: string): Promise<NextResponse | null> {
  return lockedResponse(req, slug, await fetchEventGuestSettingsCached(slug));
}
