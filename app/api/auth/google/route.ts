import { NextRequest, NextResponse } from "next/server";

// One-time setup helper: visit /api/auth/google in a browser, sign in, and
// grant access. The callback route below then prints a refresh token to
// copy into .env.local as GOOGLE_REFRESH_TOKEN.
export async function GET(req: NextRequest) {
  const redirectUri = `${req.nextUrl.origin}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent",
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
