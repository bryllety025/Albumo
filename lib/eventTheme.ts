import { cache } from "react";
import {
  BACKGROUND_STYLES,
  COVER_NAME_PATTERN,
  FRAME_STYLES,
  FRAME_WIDTHS,
  HEADING_FONTS,
  HERO_STYLES,
  HEX_COLOR_PATTERN,
  MAX_MONOGRAM_LENGTH,
  MAX_STAMP_TEXT_LENGTH,
  MAX_WELCOME_MESSAGE_LENGTH,
  PHOTO_STAMPS,
  type EventAppearance,
} from "./theme";

// Kept out of backendEvents.ts, which proxy.ts also imports: React's `cache`
// belongs to Server Components, not to the proxy.
const EVENTS_API_URL = process.env.EVENTS_API_URL ?? "http://localhost:3000";

// The owner's chosen look for this event (and its cover photo), or null for
// the default one. Live `no-store` for the same reason as the uploads mode: a
// change the owner just saved should show up the next time a guest opens the
// app. Wrapped in `cache` so the root layout and the page, which both need it,
// share one request.
//
// Everything here ends up in a style attribute, an <img> URL or the canvas
// the camera draws on, so each value is checked against what the app knows how
// to draw rather than trusted: anything unrecognised falls back to its default,
// and a theme whose colors aren't plain 6-digit hex reads as "no theme".
export const fetchEventTheme = cache(async (slug: string): Promise<EventAppearance | null> => {
  try {
    const res = await fetch(`${EVENTS_API_URL}/events/public/${encodeURIComponent(slug)}`, {
      headers: { "x-api-key": process.env.EVENTS_API_KEY ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      theme?: Record<string, unknown> | null;
      coverImage?: unknown;
    };
    const raw = data.theme;
    if (!raw) return null;

    const { background, foreground, accent } = raw;
    if (
      typeof background !== "string" || !HEX_COLOR_PATTERN.test(background) ||
      typeof foreground !== "string" || !HEX_COLOR_PATTERN.test(foreground) ||
      typeof accent !== "string" || !HEX_COLOR_PATTERN.test(accent)
    ) {
      return null;
    }

    return {
      background,
      foreground,
      accent,
      headingFont: oneOf(HEADING_FONTS, raw.headingFont, "modern"),
      backgroundStyle: oneOf(BACKGROUND_STYLES, raw.backgroundStyle, "solid"),
      hero: oneOf(HERO_STYLES, raw.hero, "icon"),
      monogram: text(raw.monogram, MAX_MONOGRAM_LENGTH),
      welcomeMessage: text(raw.welcomeMessage, MAX_WELCOME_MESSAGE_LENGTH),
      photoStamp: oneOf(PHOTO_STAMPS, raw.photoStamp, "none"),
      frameStyle: oneOf(FRAME_STYLES, raw.frameStyle, "classic"),
      frameWidth: oneOf(FRAME_WIDTHS, raw.frameWidth, "medium"),
      // Drawn onto a canvas, so anything but plain hex is no color: the design uses its own.
      stampColor:
        typeof raw.stampColor === "string" && HEX_COLOR_PATTERN.test(raw.stampColor) ? raw.stampColor : null,
      stampText: text(raw.stampText, MAX_STAMP_TEXT_LENGTH),
      // On unless explicitly turned off, as for a frame saved before this option existed.
      stampCaption: raw.stampCaption !== false,
      coverImage:
        typeof data.coverImage === "string" && COVER_NAME_PATTERN.test(data.coverImage) ? data.coverImage : null,
    };
  } catch (err) {
    console.error("Failed to read the theme from albumo-backend:", err);
    return null;
  }
});

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed === "" ? null : trimmed;
}
