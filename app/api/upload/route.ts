import { NextRequest, NextResponse } from "next/server";
import { uploadPhoto } from "@/lib/s3";
import { registerUpload } from "@/lib/backendEvents";
import { checkUploadAllowed, nameRequiredResponse, registeredResponse } from "@/lib/uploadGate";

// The photo comes through here as the request body. The camera no longer sends photos this way (it asks
// /api/upload/prepare for a form and sends the photo straight to S3, then tells /api/upload/complete): a host like
// Vercel refuses a request body over 4.5 MB before it gets here. This is the way back for a photo that couldn't go
// straight to S3, and it can only ever carry the photos small enough to pass.
export async function POST(req: NextRequest) {
  const gate = await checkUploadAllowed(req);
  if (!gate.ok) return gate.response;
  const { config, guestSettings } = gate;

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

  const nameRequired = nameRequiredResponse(guestSettings, uploaderName);
  if (nameRequired) return nameRequired;

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const fileId = await uploadPhoto(
      config,
      bytes,
      filename,
      file.type || "image/jpeg"
    );
    const registered = await registerUpload(config.slug, fileId, uploaderName, uploaderToken);
    return registeredResponse(fileId, registered);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Upload to S3 failed" }, { status: 500 });
  }
}
