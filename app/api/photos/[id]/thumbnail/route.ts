import { NextResponse } from "next/server";
import { getDriveFile } from "@/lib/googleDrive";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { bytes, mimeType } = await getDriveFile(id);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Couldn't load photo" }, { status: 500 });
  }
}
