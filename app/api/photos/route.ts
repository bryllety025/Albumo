import { NextResponse } from "next/server";
import { listPhotos } from "@/lib/googleDrive";

export async function GET() {
  try {
    const files = await listPhotos();
    return NextResponse.json({ files });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Couldn't load photos from Drive" },
      { status: 500 }
    );
  }
}
