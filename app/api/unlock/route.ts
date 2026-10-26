import { NextRequest, NextResponse } from "next/server";
import { verifyEventSlug, verifyGuestPassword } from "@/lib/backendEvents";
import { registerDevice } from "@/lib/access";
import { clearWrongTries, clientAddress, recordWrongTry, waitSeconds } from "@/lib/attempts";

// Slugs are made of lowercase letters, digits and hyphens (albumo-backend's slugify).
const SLUG_PATTERN = /^[a-z0-9-]{1,100}$/;

// The unlock page posts the event's slug and what the guest typed. On the right password this device is
// registered to the event, exactly as opening the link of an event with no password does (proxy.ts), and also
// given the cookie that remembers the password was right.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { slug?: unknown; password?: unknown } | null;
  const slug = typeof body?.slug === "string" ? body.slug : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!SLUG_PATTERN.test(slug) || password.length > 100) {
    return NextResponse.json({ error: "Enter the event's password." }, { status: 400 });
  }

  const address = clientAddress(req);
  const wait = waitSeconds(address, slug);
  if (wait > 0) {
    return NextResponse.json(
      {
        error: `Too many wrong tries. Please wait ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""} and try again.`,
        code: "too_many_tries",
      },
      { status: 429, headers: { "Retry-After": String(wait) } },
    );
  }

  const event = await verifyEventSlug(slug);
  if (!event) {
    return NextResponse.json({ error: "This link isn't recognized." }, { status: 404 });
  }

  // Nothing to unlock: the owner took the password off since the guest opened the page.
  if (!event.passwordProtected) {
    const response = NextResponse.json({ ok: true });
    registerDevice(response, event, null);
    return response;
  }

  const check = await verifyGuestPassword(slug, password);
  if (!check.ok) {
    if (check.reason === "wrong") {
      recordWrongTry(address, slug);
      return NextResponse.json({ error: "That isn't the password. Check it and try again.", code: "wrong_password" }, { status: 401 });
    }
    return NextResponse.json(
      { error: check.reason === "unknown_event" ? "This link isn't recognized." : "Couldn't check the password just now. Try again in a moment." },
      { status: check.reason === "unknown_event" ? 404 : 503 },
    );
  }

  clearWrongTries(address, slug);
  const response = NextResponse.json({ ok: true });
  // The stamp the backend vouches for right now (null if the owner removed the password in the meantime, when
  // there is nothing to remember).
  registerDevice(response, event, check.stamp);
  return response;
}
