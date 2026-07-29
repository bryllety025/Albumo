import { NextResponse } from "next/server";
import { getPhoto } from "@/lib/s3";
import { getTenantConfigFromRequest } from "@/lib/tenant";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const config = getTenantConfigFromRequest(req);
    const { bytes, mimeType } = await getPhoto(config, id);
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
