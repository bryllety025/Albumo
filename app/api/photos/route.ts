import { NextRequest, NextResponse } from "next/server";
import { listPhotos } from "@/lib/s3";
import { getEventConfigFromRequest } from "@/lib/event";
import { guestGate } from "@/lib/access";

export async function GET(request: NextRequest) {
  const config = getEventConfigFromRequest(request);
  if (!config) {
    return NextResponse.json(
      { error: "No event context. Open your invite link first." },
      { status: 400 }
    );
  }
  const locked = await guestGate(request, config.slug);
  if (locked) return locked;

  try {
    const files = await listPhotos(config);
    return NextResponse.json({ files });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Couldn't load photos from S3" },
      { status: 500 }
    );
  }
}
