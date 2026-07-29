import { NextResponse } from "next/server";
import { listPhotos } from "@/lib/s3";

export async function GET() {
  try {
    const files = await listPhotos();
    return NextResponse.json({ files });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Couldn't load photos from S3" },
      { status: 500 }
    );
  }
}
