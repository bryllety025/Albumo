import { NextResponse } from "next/server";
import { getAlbumPage } from "@/lib/s3";
import { getEventConfigFromRequest } from "@/lib/event";
import { ALBUM_ID_PATTERN, MAX_ALBUM_PAGES } from "@/lib/album";

// One page of an album the event owner shared, as a JPEG (page 0 is the cover). The `v` in the address is only
// there to change it if the pages ever do, so each address always means the same picture and can be kept for
// good. `private`: the picture belongs to the guests of this event (the cookie says which), not to a shared cache.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; page: string }> }
) {
  const { id, page } = await params;

  const config = getEventConfigFromRequest(req);
  if (!config) {
    return NextResponse.json(
      { error: "No event context. Open your invite link first." },
      { status: 400 }
    );
  }

  const index = /^\d{1,2}$/.test(page) ? Number(page) : -1;
  if (!ALBUM_ID_PATTERN.test(id) || index < 0 || index >= MAX_ALBUM_PAGES) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const bytes = await getAlbumPage(config, id, index);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=31536000, immutable",
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
    return NextResponse.json({ error: "Couldn't load the album page" }, { status: 500 });
  }
}
