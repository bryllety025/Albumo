import { NextResponse } from "next/server";
import { getPhoto } from "@/lib/s3";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { bytes, mimeType, name } = await getPhoto(id);
    const safeName = name.replace(/"/g, "");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Couldn't download photo" },
      { status: 500 }
    );
  }
}
