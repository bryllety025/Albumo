import { cookies } from "next/headers";

// Set by proxy.ts once it has verified a slug against albumo-backend, so
// every later request on this device can identify which event it belongs to
// without another network round trip. Base64url-encoded so the JSON payload
// survives unchanged through any cookie-header encode/decode step.
export const EVENT_COOKIE = "albumo_event";

const SHORT_NAME_MAX_LENGTH = 20;

export type EventInfo = {
  slug: string;
  eventName: string;
};

export type EventConfig = EventInfo & {
  eventShortName: string;
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsS3Bucket: string;
  awsS3Folder: string;
};

export function encodeEventCookie(info: EventInfo): string {
  return Buffer.from(JSON.stringify(info), "utf8").toString("base64url");
}

function decodeEventCookie(value: string | undefined): EventInfo | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed?.slug === "string" && typeof parsed?.eventName === "string") {
      return { slug: parsed.slug, eventName: parsed.eventName };
    }
  } catch {
    // Malformed/tampered cookie — treated the same as no cookie.
  }
  return null;
}

function getCookieFromHeader(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const prefix = `${name}=`;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return match?.slice(prefix.length);
}

function buildConfig(info: EventInfo): EventConfig {
  const require = (key: string): string => {
    const value = process.env[key];
    if (!value) throw new Error(`Missing required env var ${key}`);
    return value;
  };

  return {
    ...info,
    eventShortName:
      info.eventName.length > SHORT_NAME_MAX_LENGTH
        ? `${info.eventName.slice(0, SHORT_NAME_MAX_LENGTH - 1)}…`
        : info.eventName,
    awsRegion: require("AWS_REGION"),
    awsAccessKeyId: require("AWS_ACCESS_KEY_ID"),
    awsSecretAccessKey: require("AWS_SECRET_ACCESS_KEY"),
    awsS3Bucket: require("AWS_S3_BUCKET"),
    // The S3 key prefix is always the slug itself — see lib/s3.ts.
    awsS3Folder: info.slug,
  };
}

// For Route Handlers, which already have the request object at hand. Reads
// the raw Cookie header directly so it works for both `Request` and
// `NextRequest` typed handlers.
export function getEventConfigFromRequest(request: Request): EventConfig | null {
  const info = decodeEventCookie(getCookieFromHeader(request.headers.get("cookie"), EVENT_COOKIE));
  return info ? buildConfig(info) : null;
}

// For Server Components / generateMetadata / manifest, which read the
// current request's cookies via next/headers instead of taking a request
// param directly.
export async function getRequestEventConfig(): Promise<EventConfig | null> {
  const cookieStore = await cookies();
  const info = decodeEventCookie(cookieStore.get(EVENT_COOKIE)?.value);
  return info ? buildConfig(info) : null;
}
