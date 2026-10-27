import { NextRequest, NextResponse } from "next/server";
import { getUploadedSize } from "@/lib/s3";
import { registerUpload } from "@/lib/backendEvents";
import { checkUploadAllowed, nameRequiredResponse, registeredResponse } from "@/lib/uploadGate";
import { PHOTO_FILENAME_PATTERN } from "@/lib/uploadRules";

// Step 3 of sending a photo straight to S3: the phone says it has sent the photo, and this looks in the bucket to
// see that it really is there (the phone can't tell: it is not allowed to read S3's answer), then registers it with
// albumo-backend -- who shared it, and the photo limit and guest limit, exactly as /api/upload does for a photo
// that came through it. Safe to call again for the same photo (the backend treats a repeated name as the same
// photo), which is what lets the camera retry it.
//
// A refusal here (closed, paused, password changed in the seconds since /prepare) leaves the photo in the bucket:
// the event cookie anyone can write is not enough to say who may delete what, so only albumo-backend's own
// limit refusals take a photo back out.
export async function POST(req: NextRequest) {
  const gate = await checkUploadAllowed(req);
  if (!gate.ok) return gate.response;
  const { config, guestSettings } = gate;

  const body = (await req.json().catch(() => null)) as {
    filename?: unknown;
    uploaderName?: unknown;
    uploaderToken?: unknown;
  } | null;
  const filename = body?.filename;
  const uploaderName = typeof body?.uploaderName === "string" ? body.uploaderName : undefined;
  const uploaderToken = typeof body?.uploaderToken === "string" ? body.uploaderToken : undefined;

  if (typeof filename !== "string" || !PHOTO_FILENAME_PATTERN.test(filename)) {
    return NextResponse.json({ error: "Missing or invalid filename", code: "invalid_upload" }, { status: 400 });
  }
  const nameRequired = nameRequiredResponse(guestSettings, uploaderName);
  if (nameRequired) return nameRequired;

  try {
    // Never register a photo that isn't there: the owner's gallery is the bucket's listing, and a name that was
    // only claimed would still take up one of the event's photo-limit slots.
    if ((await getUploadedSize(config, filename)) === null) {
      return NextResponse.json({ error: "That photo hasn't been uploaded", code: "not_uploaded" }, { status: 404 });
    }
    const registered = await registerUpload(config.slug, filename, uploaderName, uploaderToken);
    return registeredResponse(filename, registered);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Couldn't finish the upload" }, { status: 500 });
  }
}
