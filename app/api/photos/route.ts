import { NextRequest, NextResponse } from "next/server";
import { listPhotos } from "@/lib/s3";
import { getTenantConfigFromRequest } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const config = getTenantConfigFromRequest(request);
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
