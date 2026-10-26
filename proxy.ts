import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyEventSlug } from "@/lib/backendEvents";
import { ACCESS_COOKIE, hasAccess, registerDevice } from "@/lib/access";

// Top-level path segments that are always real app routes, never a
// candidate event slug.
const RESERVED_TOP_LEVEL_PATHS = new Set(["", "gallery", "album", "api"]);

function candidateSlug(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 1) return null;

  const [slug] = segments;
  // Static files served from the public/ root (favicon.ico, sw.js, *.svg,
  // manifest.webmanifest, ...) all have an extension; slugs never do.
  if (RESERVED_TOP_LEVEL_PATHS.has(slug) || slug.includes(".")) return null;

  return slug;
}

// A visit to /{slug} is a guest's one-time entry link. If it matches a real
// event in albumo-backend, this device is registered to that event via a
// cookie and redirected to "/" — the rest of the app is unchanged, reading
// that cookie instead of a subdomain to know which event it's serving.
//
// An event whose owner has put a password on its link registers the device only once the guest has given the
// password (see app/unlock): until then the guest is sent to the page that asks for it, and the event's own
// cookie is not set.
export async function proxy(request: NextRequest) {
  const slug = candidateSlug(request.nextUrl.pathname);
  if (!slug) {
    return NextResponse.next();
  }

  const event = await verifyEventSlug(slug);
  if (!event) {
    // Not a real event slug — let Next's router 404 it like any unknown
    // route, without touching an existing session cookie.
    return NextResponse.next();
  }

  if (!hasAccess(event, request.cookies.get(ACCESS_COOKIE)?.value)) {
    return NextResponse.redirect(new URL(`/unlock/${encodeURIComponent(event.slug)}`, request.url));
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  registerDevice(response, event, null);
  return response;
}

// `api/` is left out on purpose. The proxy has nothing to do for an API route (candidateSlug() ignores anything
// with more than one segment), but while a proxy runs, Next copies the request body into memory and cuts it off
// at 10 MB: a photo bigger than that reached /api/upload as a truncated file and failed to parse, every time.
export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icons/|sw.js).*)"],
};
