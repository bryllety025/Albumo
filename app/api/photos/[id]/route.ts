import { NextRequest, NextResponse } from "next/server";
import { deletePhoto } from "@/lib/s3";
import { getEventConfigFromRequest } from "@/lib/event";
import { deleteGuestUpload } from "@/lib/backendEvents";

// Lets a guest delete their own upload. albumo-backend is the authorization
// gate (it checks `uploaderToken` against what was recorded at upload time)
// -- only once it confirms ownership do we touch S3 here.
export async function DELETE(
  req: NextRequest,
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

  let uploaderToken: string | undefined;
  try {
    const body = await req.json();
    uploaderToken = typeof body?.uploaderToken === "string" ? body.uploaderToken : undefined;
  } catch {
    uploaderToken = undefined;
  }
  if (!uploaderToken) {
    return NextResponse.json({ error: "Missing uploaderToken" }, { status: 400 });
  }

  const authorized = await deleteGuestUpload(config.slug, id, uploaderToken);
  if (!authorized) {
    return NextResponse.json(
      { error: "This photo can't be deleted from this device." },
      { status: 403 }
    );
  }

  try {
    await deletePhoto(config, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Couldn't delete photo from storage" },
      { status: 500 }
    );
  }
}
