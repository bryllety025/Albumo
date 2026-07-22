import { NextRequest, NextResponse } from "next/server";
import { uploadToDrive } from "@/lib/googleDrive";

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
    const bytes = Buffer.from(await file.arrayBuffer());
    const fileId = await uploadToDrive(
      bytes,
      filename,
      file.type || "image/jpeg"
    );
    return NextResponse.json({ fileId });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Upload to Drive failed" }, { status: 500 });
  }
}
