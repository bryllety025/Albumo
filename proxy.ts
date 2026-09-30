import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyEventSlug } from "@/lib/backendEvents";
import { EVENT_COOKIE, encodeEventCookie } from "@/lib/event";

// Top-level path segments that are always real app routes, never a
// candidate event slug.
const RESERVED_TOP_LEVEL_PATHS = new Set(["", "gallery", "api"]);

const EVENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

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

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(EVENT_COOKIE, encodeEventCookie(event), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: EVENT_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|sw.js).*)"],
};
