import { NextRequest, NextResponse } from "next/server";
import { uploadPhoto } from "@/lib/s3";
import { getTenantConfigFromRequest } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  const filename = formData.get("filename");

  if (!(file instanceof Blob) || typeof filename !== "string") {
    return NextResponse.json(
      { error: "Missing file or filename" },
      { status: 400 }
    );
  }

  try {
    const config = getTenantConfigFromRequest(req);
    const bytes = Buffer.from(await file.arrayBuffer());
    const fileId = await uploadPhoto(
      config,
      bytes,
      filename,
      file.type || "image/jpeg"
    );
    return NextResponse.json({ fileId });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Upload to S3 failed" }, { status: 500 });
  }
}
