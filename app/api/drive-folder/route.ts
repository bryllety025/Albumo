import { NextResponse } from "next/server";
import { getDriveFolderUrl } from "@/lib/googleDrive";

export async function GET() {
  try {
    const url = await getDriveFolderUrl();
    return NextResponse.json({ url });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Couldn't reach Google Drive" }, { status: 500 });
  }
}
