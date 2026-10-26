import { NextRequest, NextResponse } from "next/server";
import { fetchEventGuestSettings, fetchEventZip } from "@/lib/backendEvents";
import { getEventConfigFromRequest } from "@/lib/event";
import { lockedResponse } from "@/lib/access";

// The gallery's "Download all": every photo and video of the event as one ZIP, built and streamed by
// albumo-backend (the same one the host can download) and passed straight on, so a big event is never held in
// memory here. Only while the host leaves the button on.
//
// `?check=1` answers 204 if a download would be allowed, without starting one. The gallery asks first so that a
// refusal can be shown as a message: a browser that is told to save a file and gets an error instead just saves
// the error.
export async function GET(req: NextRequest) {
  const config = getEventConfigFromRequest(req);
  if (!config) {
    return NextResponse.json(
      { error: "No event context. Open your invite link first." },
      { status: 400 }
    );
  }

  const settings = await fetchEventGuestSettings(config.slug);
  const locked = lockedResponse(req, config.slug, settings);
  if (locked) return locked;
  if (!settings?.allowDownloadAll) {
    return NextResponse.json(
      { error: "The host has turned off downloading everything at once. You can still select photos to download.", code: "download_all_off" },
      { status: 403 }
    );
  }

  if (req.nextUrl.searchParams.get("check") === "1") {
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  const upstream = await fetchEventZip(config.slug, req.signal);
  if (!upstream) {
    return NextResponse.json({ error: "Couldn't start the download. Try again in a moment." }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    // The backend answers 400 when the event holds more files than one ZIP may.
    const tooMany = upstream.status === 400;
    return NextResponse.json(
      {
        error: tooMany
          ? "This album is too big to download all at once. Select the photos you want instead."
          : "Couldn't start the download. Try again in a moment.",
        code: tooMany ? "too_many_files" : "download_failed",
      },
      { status: tooMany ? 413 : 502 }
    );
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${config.slug.replace(/[^a-z0-9-]/gi, "")}-photos.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
