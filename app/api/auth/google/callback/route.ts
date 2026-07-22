import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const redirectUri = `${req.nextUrl.origin}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await res.json();

  if (!data.refresh_token) {
    return new NextResponse(
      `<pre>${JSON.stringify(data, null, 2)}\n\n` +
        `No refresh_token was returned. Google only issues one the first ` +
        `time you consent. Revoke prior access at ` +
        `https://myaccount.google.com/permissions and try again.</pre>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  return new NextResponse(
    `<pre>Copy this value into .env.local as GOOGLE_REFRESH_TOKEN:\n\n` +
      `${data.refresh_token}\n\n` +
      `Then you can stop using this page.</pre>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
