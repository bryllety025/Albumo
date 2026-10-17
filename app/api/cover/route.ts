import { NextResponse } from "next/server";
import { getCover } from "@/lib/s3";
import { getEventConfigFromRequest } from "@/lib/event";
import { COVER_NAME_PATTERN } from "@/lib/theme";

// Decided here from the file's extension, not taken from whatever the bucket
// says the object is.
const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// The event's cover photo, shown at the top of the guest page when the owner
// chose one. `v` is the file's name: albumo-backend gives every upload a fresh
// one, so each URL always means the same bytes and can be cached forever, and
// a replaced cover simply gets a new URL.
export async function GET(req: Request) {
  const config = getEventConfigFromRequest(req);
  if (!config) {
    return NextResponse.json(
      { error: "No event context. Open your invite link first." },
      { status: 400 }
    );
  }

  const name = new URL(req.url).searchParams.get("v") ?? "";
  if (!COVER_NAME_PATTERN.test(name)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const bytes = await getCover(config, name);
    const extension = name.slice(name.lastIndexOf(".") + 1);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": CONTENT_TYPES[extension],
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    // S3 reports a missing object as NoSuchKey, NotFound or just a 404, depending on the call and endpoint.
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || (err instanceof Error && (err.name === "NoSuchKey" || err.name === "NotFound"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Couldn't load the cover photo" }, { status: 500 });
  }
}
