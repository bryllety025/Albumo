// Prints the event's caption, or a frame around the picture, onto a photo the
// guest just took with the in-app camera, when the event owner has turned that
// on (see the Photos tab of the theme studio). Browser-only: it draws on a
// <canvas>.
//
// This file exists twice, identical apart from the import lines: here, and as
// albumo-frontend/lib/photoStamp.ts, where the theme studio draws its preview.
// A preview is only worth anything if the very same code draws it, so change
// both together.

import { onColor, type FrameStyle, type FrameWidth, type PhotoStamp } from "./theme";

export type StampMode = Exclude<PhotoStamp, "none">;

export type StampTheme = { accent: string; background: string; foreground: string };

/** Everything the event owner chose about the stamp. */
export type StampSettings = {
  mode: StampMode;
  style: FrameStyle;
  width: FrameWidth;
  /** A "#rrggbb" color, or null for the design's own (see `autoStampColor`). */
  color: string | null;
  /** The caption, with `{event}` and `{date}` standing for the event's name and date; null for the default. */
  text: string | null;
  /** Whether a frame has a caption strip at all. A caption stamp always has its text. */
  caption: boolean;
  theme: StampTheme;
};

/** The font to set the caption in. */
export type StampFont = { family: string; weight: string | number; scale: number };

/** What is specific to the event and the page, rather than to the owner's choices. */
export type StampContext = {
  eventName: string;
  /** e.g. "December 25, 2026", as `formatStampDate` writes it. */
  dateLabel: string;
  font: StampFont;
};

export const DEFAULT_STAMP_TEXT = "{event} · {date}";

// How long to wait for the caption font before drawing with whatever the
// browser has. A capture must never stall on a slow font download.
const FONT_WAIT_MS = 600;

// The paper behind a perforated edge. JPEG has no transparency, so the bites
// cut into a stamp's border have to show some color.
const BACKDROP = "#ffffff";

/** "YYYY-MM-DD" as e.g. "December 25, 2026", without any UTC/local shift. */
export function formatStampDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** The caption's final text, or "" when there is to be none. */
export function resolveStampText(
  settings: Pick<StampSettings, "mode" | "text" | "caption">,
  eventName: string,
  dateLabel: string,
): string {
  if (settings.mode === "frame" && !settings.caption) return "";

  // A blank caption is the default one, as the dashboard saves it. Replaced in one pass, so a name that
  // happens to contain "{date}" is left as it is.
  const template = settings.text && settings.text.trim() !== "" ? settings.text : DEFAULT_STAMP_TEXT;
  return template
    .replace(/\{(event|date)\}/g, (_, token: string) => (token === "event" ? eventName : dateLabel))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The color a design uses when the owner hasn't picked one. A postage stamp takes the accent color like the
 * plain frames do: its perforations are bites through to white, so a near-white paper would hide them.
 */
export function autoStampColor(style: FrameStyle, mode: StampMode, theme: StampTheme): string {
  if (mode === "caption") return theme.accent;

  switch (style) {
    case "polaroid":
      return "#fbf8f1";
    case "elegant":
      return theme.background;
    case "classic":
    case "rounded":
    case "scalloped":
    default:
      return theme.accent;
  }
}

const fontCss = (font: StampFont, px: number) => `${font.weight} ${Math.round(px)}px ${font.family}`;

async function ensureFontLoaded(font: StampFont, text: string): Promise<void> {
  if (!text || !document.fonts) return;
  try {
    await Promise.race([
      document.fonts.load(fontCss(font, 32), text),
      new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS)),
    ]);
  } catch {
    // Draw with the fallback face instead.
  }
}

// The largest font size, at most `startPx`, at which `text` fits `maxWidth`;
// below `minPx` the text is cut short with an ellipsis instead of shrinking
// into something unreadable.
function fitText(
  ctx: CanvasRenderingContext2D,
  font: StampFont,
  text: string,
  maxWidth: number,
  startPx: number,
  minPx: number,
): { text: string; px: number } {
  let px = startPx;
  ctx.font = fontCss(font, px);
  while (ctx.measureText(text).width > maxWidth && px > minPx) {
    px *= 0.94;
    ctx.font = fontCss(font, px);
  }

  let fitted = text;
  while (fitted.length > 1 && ctx.measureText(fitted).width > maxWidth) {
    fitted = fitted.slice(0, -2).trimEnd() + "…";
  }
  return { text: fitted, px };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// How thick each setting makes the border, as a fraction of the photo's
// shorter side. Everything is sized from that side, so a frame looks the same
// on a portrait shot, a landscape one, and at any camera resolution.
const WIDTH_UNITS: Record<FrameWidth, number> = { thin: 0.018, medium: 0.03, thick: 0.05 };

type Geometry = {
  /** The border on the top, left and right. */
  border: number;
  /** The height of the area under the picture, where the caption goes. */
  strip: number;
  /** Corner radius of the picture itself. */
  radius: number;
  /** The distance between a stamp's perforations. */
  pitch: number;
};

function geometry(style: FrameStyle, width: FrameWidth, u: number, hasText: boolean): Geometry {
  const w = WIDTH_UNITS[width];

  switch (style) {
    case "polaroid": {
      const border = Math.round(u * w * 1.5);
      return { border, strip: hasText ? Math.round(u * (0.12 + w * 2)) : border * 2, radius: 0, pitch: 0 };
    }
    case "elegant": {
      const border = Math.max(Math.round(u * w * 1.4), Math.round(u * 0.03));
      return { border, strip: hasText ? Math.round(u * (0.095 + w)) : border, radius: 0, pitch: 0 };
    }
    case "rounded": {
      const border = Math.round(u * w * 1.2);
      return {
        border,
        strip: hasText ? Math.round(u * (0.09 + w)) : border,
        radius: Math.round(u * (0.03 + w)),
        pitch: 0,
      };
    }
    case "scalloped": {
      const pitch = u * (0.035 + w * 0.5);
      // Wide enough that the bites never reach the picture.
      const border = Math.max(Math.round(u * w * 1.2), Math.round(pitch * 0.3 * 3.2));
      return { border, strip: hasText ? Math.round(u * (0.095 + w)) : border, radius: 0, pitch };
    }
    case "classic":
    default: {
      const border = Math.round(u * w);
      return { border, strip: hasText ? Math.round(u * (0.09 + w)) : border, radius: 0, pitch: 0 };
    }
  }
}

function paintBackground(ctx: CanvasRenderingContext2D, style: FrameStyle, w: number, h: number, color: string, pitch: number) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  if (style !== "scalloped") return;

  // Perforations: half-circles bitten out of every edge, spaced evenly and
  // starting half a step in, so the four corners stay whole.
  ctx.fillStyle = BACKDROP;
  const r = pitch * 0.3;
  const along = (length: number, at: (c: number) => [number, number]) => {
    const count = Math.max(2, Math.round(length / pitch));
    const step = length / count;
    for (let k = 0; k < count; k++) {
      const [x, y] = at(step * (k + 0.5));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  along(w, (c) => [c, 0]);
  along(w, (c) => [c, h]);
  along(h, (c) => [0, c]);
  along(h, (c) => [w, c]);
}

// A new, larger canvas: the border goes around the picture rather than over
// it, so nothing in the shot is covered.
function drawFrame(
  source: HTMLCanvasElement,
  settings: StampSettings,
  text: string,
  color: string,
  ink: string,
  font: StampFont,
  u: number,
): HTMLCanvasElement {
  const { width: w, height: h } = source;
  const { border, strip, radius, pitch } = geometry(settings.style, settings.width, u, text !== "");

  const out = document.createElement("canvas");
  out.width = w + border * 2;
  out.height = h + border + strip;
  const ctx = out.getContext("2d");
  if (!ctx) return source;

  paintBackground(ctx, settings.style, out.width, out.height, color, pitch);

  ctx.save();
  if (radius > 0) {
    roundedRect(ctx, border, border, w, h, radius);
    ctx.clip();
  }
  ctx.drawImage(source, border, border);
  ctx.restore();

  const line = Math.max(1, Math.round(u * 0.003));
  // Where the caption's middle sits; most designs center it in the strip.
  let textY = border + h + strip / 2;

  if (settings.style === "polaroid") {
    // The faint edge of the print around the picture, and of the paper itself.
    ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
    ctx.lineWidth = line;
    ctx.strokeRect(border - line / 2, border - line / 2, w + line, h + line);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
    ctx.strokeRect(line / 2, line / 2, out.width - line, out.height - line);
  } else if (settings.style === "elegant") {
    // Two fine lines: one near the edge of the card, one around the picture.
    const inset = border * 0.3;
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = line;
    ctx.strokeRect(inset, inset, out.width - inset * 2, out.height - inset * 2);
    ctx.strokeRect(border - inset, border - inset, w + inset * 2, h + inset * 2);
    ctx.globalAlpha = 1;
    textY = (border + h + inset + (out.height - inset)) / 2;
  }

  if (text) {
    const startPx = Math.min(u * (settings.style === "polaroid" ? 0.05 : 0.045) * font.scale, strip / 2.1);
    const fitted = fitText(ctx, font, text, out.width - border * 4, startPx, u * 0.022);
    ctx.font = fontCss(font, fitted.px);
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fitted.text, out.width / 2, textY);
  }

  return out;
}

// The same canvas, drawn on: a rounded label near the bottom.
function drawCaption(
  source: HTMLCanvasElement,
  text: string,
  color: string,
  ink: string,
  font: StampFont,
  u: number,
): HTMLCanvasElement {
  const ctx = source.getContext("2d");
  if (!ctx) return source;

  const { width: w, height: h } = source;
  const maxPillWidth = w * 0.92;
  const startPx = u * 0.034 * font.scale;
  const padX = startPx * 0.9;
  const fitted = fitText(ctx, font, text, maxPillWidth - padX * 2, startPx, u * 0.02);
  const pillHeight = fitted.px * 2;
  const pillWidth = ctx.measureText(fitted.text).width + padX * 2;
  const x = (w - pillWidth) / 2;
  const y = h - pillHeight - u * 0.04;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = fitted.px * 0.6;
  ctx.shadowOffsetY = fitted.px * 0.15;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.94;
  roundedRect(ctx, x, y, pillWidth, pillHeight, pillHeight / 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.font = fontCss(font, fitted.px);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(fitted.text, w / 2, y + pillHeight / 2);
  ctx.restore();

  return source;
}

/**
 * Returns the canvas to save: the same one, drawn on, for a caption; a new,
 * larger one for a frame. `source` is the photo as taken.
 */
export async function applyPhotoStamp(
  source: HTMLCanvasElement,
  settings: StampSettings,
  context: StampContext,
): Promise<HTMLCanvasElement> {
  const text = resolveStampText(settings, context.eventName, context.dateLabel);
  await ensureFontLoaded(context.font, text);

  const color = settings.color ?? autoStampColor(settings.style, settings.mode, settings.theme);
  const ink = onColor(color);
  const u = Math.min(source.width, source.height);

  if (settings.mode === "caption") {
    return text ? drawCaption(source, text, color, ink, context.font, u) : source;
  }
  return drawFrame(source, settings, text, color, ink, context.font, u);
}
