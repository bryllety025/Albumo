import { NextResponse } from "next/server";
import { getPhoto } from "@/lib/s3";
import { getEventConfigFromRequest } from "@/lib/event";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const config = getEventConfigFromRequest(req);
  if (!config) {
    return NextResponse.json(
      { error: "No event context. Open your invite link first." },
      { status: 400 }
    );
  }

  try {
    const { bytes, mimeType, name } = await getPhoto(config, id);
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
