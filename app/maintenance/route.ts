import { MAINTENANCE_MODE } from "@/lib/maintenance";

// A Route Handler rather than a page on purpose: it skips the root layout, which reads the event's theme from
// albumo-backend on every render and so can't be trusted while the servers are being worked on. The page below is
// one self-contained HTML document (inline styles and logo, nothing to fetch) answered with a real 503, so crawlers
// and caches treat the outage as temporary and nothing about it gets indexed or stored.
//
// proxy.ts rewrites every page URL here, and next.config.ts does the same for /api/*. A rewrite leaves the requested
// URL as it was, so the handler tells the two apart by path: the app's own requests (photo uploads, the gallery
// list) get a JSON 503 their retry logic understands, everything else gets the page.

const RETRY_AFTER_SECONDS = 300;
const RELOAD_EVERY_SECONDS = 60;

const COMMON_HEADERS = {
  "Cache-Control": "no-store",
  "Retry-After": String(RETRY_AFTER_SECONDS),
  "X-Robots-Tag": "noindex, nofollow",
};

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<meta http-equiv="refresh" content="${RELOAD_EVERY_SECONDS}">
<title>Under maintenance — Albumo</title>
<link rel="icon" href="/icons/icon-192.png">
<style>
  :root {
    --bg: #f7f7f8;
    --card: #ffffff;
    --fg: #12131a;
    --muted: #4b5563;
    --faint: #6b7280;
    --accent: #4f46e5;
    --accent-soft: #ede9fe;
    --tagline: #64748b;
    --shadow: 0 1px 3px rgba(17, 19, 24, 0.06), 0 12px 32px rgba(17, 19, 24, 0.06);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #12131a;
      --card: #1f2130;
      --fg: #f4f4f5;
      --muted: #a1a1aa;
      --faint: #8b8d98;
      --accent: #6366f1;
      --accent-soft: rgba(99, 102, 241, 0.2);
      --tagline: #94a3b8;
      --shadow: none;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    background: var(--bg);
    color: var(--fg);
    font-family: Arial, Helvetica, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { width: 100%; max-width: 440px; text-align: center; }
  .logo { display: block; width: 190px; max-width: 70%; height: auto; margin: 0 auto 28px; color: var(--fg); }
  .logo .cut { fill: var(--bg); }
  .card { background: var(--card); border-radius: 24px; padding: 36px 28px 32px; box-shadow: var(--shadow); }
  .badge {
    width: 68px; height: 68px; margin: 0 auto 22px; border-radius: 50%;
    display: grid; place-items: center; background: var(--accent-soft); color: var(--accent);
  }
  .badge svg { width: 30px; height: 30px; transform-origin: 50% 50%; animation: tilt 2.4s ease-in-out infinite; }
  @keyframes tilt { 0%, 100% { transform: rotate(-12deg); } 50% { transform: rotate(12deg); } }
  h1 { margin: 0 0 12px; font-size: 26px; line-height: 1.2; font-weight: 700; letter-spacing: -0.01em; }
  p { margin: 0; font-size: 15px; line-height: 1.65; color: var(--muted); }
  .btn {
    display: inline-block; margin-top: 26px; padding: 12px 26px; border-radius: 999px;
    background: var(--accent); color: #fff; font-size: 15px; font-weight: 600; text-decoration: none;
  }
  .btn:hover { filter: brightness(1.08); }
  .btn:focus-visible { outline: 3px solid var(--accent-soft); outline-offset: 2px; }
  .note { margin-top: 18px; font-size: 13px; line-height: 1.5; color: var(--faint); }
  @media (prefers-reduced-motion: reduce) { .badge svg { animation: none; } }
</style>
</head>
<body>
<main>
  <svg class="logo" viewBox="150 200 1320 450" role="img" aria-label="Albumo">
    <text x="150" y="450" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="325" textLength="925" lengthAdjust="spacingAndGlyphs" fill="currentColor">album</text>
    <rect x="1140" y="210" width="320" height="320" rx="90" fill="currentColor"/>
    <g class="cut">
      <rect x="1190" y="260" width="90" height="90"/>
      <rect x="1310" y="260" width="90" height="90"/>
      <rect x="1190" y="380" width="90" height="90"/>
      <rect x="1330" y="400" width="50" height="50"/>
    </g>
    <text x="150" y="625" font-family="Arial, Helvetica, sans-serif" font-size="106" textLength="1060" fill="var(--tagline)">event photo sharing</text>
  </svg>
  <div class="card">
    <div class="badge" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
    </div>
    <h1>We&rsquo;ll be right back</h1>
    <p>Albumo is undergoing maintenance. We&rsquo;re working on our servers and everything will be back shortly.</p>
    <a class="btn" href="">Try again</a>
    <p class="note">This page checks again by itself every minute.<br>Thank you for your patience.</p>
  </div>
</main>
</body>
</html>
`;

function handle(request: Request): Response {
  const { pathname } = new URL(request.url);
  const isApi = pathname === "/api" || pathname.startsWith("/api/");

  // With the switch off there is nothing to show: behave like any other URL that doesn't exist. An /api request is
  // the exception. Its rewrite is fixed at build time, so one can still arrive from a build made while the switch
  // was on; it keeps the retryable 503 until the next build, instead of a 404 an upload would give up on.
  if (!MAINTENANCE_MODE && !isApi) return new Response("Not Found", { status: 404 });

  if (isApi) {
    return Response.json(
      { error: "maintenance", message: "Albumo is under maintenance. Please try again shortly." },
      { status: 503, headers: COMMON_HEADERS },
    );
  }

  return new Response(PAGE, {
    status: 503,
    headers: { ...COMMON_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
