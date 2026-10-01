import { NextRequest, NextResponse } from "next/server";
import { uploadPhoto } from "@/lib/s3";
import { getEventConfigFromRequest } from "@/lib/event";
import { registerUpload } from "@/lib/backendEvents";

export async function POST(req: NextRequest) {
  const config = getEventConfigFromRequest(req);
  if (!config) {
    return NextResponse.json(
      { error: "No event context. Open your invite link first." },
      { status: 400 }
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
    await registerUpload(config.slug, fileId, uploaderName, uploaderToken);
    return NextResponse.json({ fileId });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Upload to S3 failed" }, { status: 500 });
  }
}
