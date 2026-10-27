import { NextRequest, NextResponse } from "next/server";
import { createUploadForm } from "@/lib/s3";
import { checkUploadAllowed, nameRequiredResponse } from "@/lib/uploadGate";
import { MAX_PHOTO_BYTES, PHOTO_FILENAME_PATTERN, isPhotoType } from "@/lib/uploadRules";

// Step 1 of sending a photo straight to S3: every check the upload route makes (password, paused, window, required
// name), and then a form the phone can POST this one photo to. The photo itself never passes through here, so a big
// one can't hit a request-size limit (Vercel's is 4.5 MB) or tie up this server's memory. Step 2 is the phone's POST
// to S3, step 3 is /api/upload/complete.
export async function POST(req: NextRequest) {
  const gate = await checkUploadAllowed(req);
  if (!gate.ok) return gate.response;
  const { config, guestSettings } = gate;

  const body = (await req.json().catch(() => null)) as {
    filename?: unknown;
    contentType?: unknown;
    size?: unknown;
    uploaderName?: unknown;
  } | null;
  const { filename, contentType, size } = body ?? {};
  const uploaderName = typeof body?.uploaderName === "string" ? body.uploaderName : undefined;

  if (typeof filename !== "string" || !PHOTO_FILENAME_PATTERN.test(filename)) {
    return NextResponse.json({ error: "Missing or invalid filename", code: "invalid_upload" }, { status: 400 });
  }
  if (typeof contentType !== "string" || !isPhotoType(contentType)) {
    return NextResponse.json({ error: "That file isn't a photo we can take", code: "invalid_upload" }, { status: 400 });
  }
  if (typeof size !== "number" || !Number.isInteger(size) || size < 1 || size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "That photo is too big", code: "invalid_upload" }, { status: 400 });
  }

  // Before any bytes leave the phone, not after them.
  const nameRequired = nameRequiredResponse(guestSettings, uploaderName);
  if (nameRequired) return nameRequired;

  try {
    const { url, fields } = await createUploadForm(config, filename, contentType, size);
    return NextResponse.json({ url, fields });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Couldn't prepare the upload" }, { status: 500 });
  }
}
