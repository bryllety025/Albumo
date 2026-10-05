import { NextRequest, NextResponse } from "next/server";
import { uploadPhoto } from "@/lib/s3";
import { getEventConfigFromRequest } from "@/lib/event";
import { fetchEventUploadsMode, registerUpload } from "@/lib/backendEvents";
import { isTodayInManila } from "@/lib/manilaDate";

export async function POST(req: NextRequest) {
  const config = getEventConfigFromRequest(req);
  if (!config) {
    return NextResponse.json(
      { error: "No event context. Open your invite link first." },
      { status: 400 }
    );
  }

  // A fast local pre-check, same role as the old date-only check this
  // replaces: the UI already hides "Take Photo"/"Choose Photo" when it
  // shouldn't be allowed, but this is what actually stops a request made
  // directly (or from a stale page left open since before midnight, or since
  // an admin last changed this event's upload policy). Not the only
  // enforcement, though -- albumo-backend re-checks the same policy itself
  // when registerUpload is called below, so this can't be bypassed by
  // skipping straight to that call either.
  const uploadsMode = await fetchEventUploadsMode(config.slug);
  if (uploadsMode === "disabled") {
    return NextResponse.json(
      { error: "Uploads are currently paused for this event.", code: "uploads_disabled" },
      { status: 403 }
    );
  }
  if (uploadsMode === "automatic" && !isTodayInManila(config.date)) {
    return NextResponse.json(
      { error: "Photos can only be shared on the day of the event." },
      { status: 403 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const filename = formData.get("filename");
  const uploaderNameField = formData.get("uploaderName");
  const uploaderName = typeof uploaderNameField === "string" ? uploaderNameField : undefined;
  const uploaderTokenField = formData.get("uploaderToken");
  const uploaderToken = typeof uploaderTokenField === "string" ? uploaderTokenField : undefined;

  if (!(file instanceof Blob) || typeof filename !== "string") {
    return NextResponse.json(
      { error: "Missing file or filename" },
      { status: 400 }
    );
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const fileId = await uploadPhoto(
      config,
      bytes,
      filename,
      file.type || "image/jpeg"
    );
    const registered = await registerUpload(config.slug, fileId, uploaderName, uploaderToken);
    if (!registered.ok) {
      // albumo-backend has already deleted the S3 object it would otherwise
      // have orphaned -- this guest's upload did not go through, unlike every
      // other registerUpload failure (which is best-effort and already in S3).
      if (registered.reason === "uploads_disabled") {
        return NextResponse.json(
          { error: "Uploads are currently paused for this event.", code: "uploads_disabled" },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: "This event has reached its guest limit.", code: "guest_limit_reached" },
        { status: 409 }
      );
    }
    return NextResponse.json({ fileId });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Upload to S3 failed" }, { status: 500 });
  }
}
