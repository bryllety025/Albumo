import { NextResponse } from "next/server";
import { getEventConfigFromRequest, type EventConfig } from "./event";
import {
  fetchEventGuestSettings,
  fetchEventUploadPolicy,
  type EventGuestSettings,
  type RegisterUploadResult,
} from "./backendEvents";
import { lockedResponse } from "./access";
import { uploadWindow } from "./manilaDate";

export type UploadGate =
  | { ok: true; config: EventConfig; guestSettings: EventGuestSettings | null }
  | { ok: false; response: NextResponse };

// Everything that decides whether this device may add a photo to its event right now, before any photo is
// touched. Shared by every route a photo goes through (/api/upload, and /api/upload/prepare + /complete).
export async function checkUploadAllowed(req: Request): Promise<UploadGate> {
  const config = getEventConfigFromRequest(req);
  if (!config) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No event context. Open your invite link first." }, { status: 400 }),
    };
  }

  // Both live (not the few-seconds-old copy the read-only routes use): what the host decided about the password
  // and the name, and what an admin decided about the upload policy, apply to the very next photo.
  const [guestSettings, { uploadsMode, lateUploadDays }] = await Promise.all([
    fetchEventGuestSettings(config.slug),
    fetchEventUploadPolicy(config.slug),
  ]);
  const locked = lockedResponse(req, config.slug, guestSettings);
  if (locked) return { ok: false, response: locked };

  // A fast local pre-check, same role as the old date-only check this
  // replaces: the UI already hides "Take Photo"/"Choose Photo" when it
  // shouldn't be allowed, but this is what actually stops a request made
  // directly (or from a stale page left open since before midnight, or since
  // an admin last changed this event's upload policy). Not the only
  // enforcement, though -- albumo-backend re-checks the same policy itself
  // when registerUpload is called, so this can't be bypassed by
  // skipping straight to that call either.
  if (uploadsMode === "disabled") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Uploads are currently paused for this event.", code: "uploads_disabled" },
        { status: 403 }
      ),
    };
  }
  // The event's own day plus a few after it. The camera is only offered on the day itself, but a file
  // arriving here can't be told apart by where it came from, so the whole window is open to uploads.
  if (uploadsMode === "automatic") {
    const phase = uploadWindow(config.date, lateUploadDays);
    if (phase !== "event_day" && phase !== "after_event") {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error:
              phase === "upcoming"
                ? "Photo sharing isn't open yet for this event."
                : "Photo sharing has ended for this event.",
            code: "uploads_closed",
          },
          { status: 403 }
        ),
      };
    }
  }

  return { ok: true, config, guestSettings };
}

// What the camera is told once albumo-backend has been asked to register a photo that is already in S3.
export function registeredResponse(fileId: string, registered: RegisterUploadResult): NextResponse {
  if (registered.ok) {
    // `photoCount` is how many photos the whole event holds now, which is
    // what its limit is measured against -- the camera shows it back.
    return NextResponse.json({ fileId, photoCount: registered.photoCount });
  }
  // albumo-backend has already deleted the S3 object it would otherwise
  // have orphaned -- this guest's upload did not go through, unlike every
  // other registerUpload failure (which is best-effort and already in S3).
  if (registered.reason === "uploads_disabled") {
    return NextResponse.json(
      { error: "Uploads are currently paused for this event.", code: "uploads_disabled" },
      { status: 403 }
    );
  }
  if (registered.reason === "photo_limit_reached") {
    return NextResponse.json(
      { error: "This event has reached its photo limit.", code: "photo_limit_reached" },
      { status: 409 }
    );
  }
  return NextResponse.json(
    { error: "This event has reached its guest limit.", code: "guest_limit_reached" },
    { status: 409 }
  );
}

// The host asked for every photo to carry a name. The camera makes sure it has one; this is what stops a request
// made without it, before anything is written to S3 (or, for a photo already uploaded, before it is registered).
export function nameRequiredResponse(
  guestSettings: EventGuestSettings | null,
  uploaderName: string | undefined
): NextResponse | null {
  if (guestSettings?.guestNameRequired && !uploaderName?.trim()) {
    return NextResponse.json({ error: "Add your name to share photos.", code: "name_required" }, { status: 400 });
  }
  return null;
}
