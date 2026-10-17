// Prints the event's name and date onto a photo the guest just took with the
// in-app camera, when the event owner has turned that on (see PhotoStamp in
// lib/theme.ts). Browser-only: it draws on a <canvas> and reads the page's
// heading font from the CSS variables the theme sets on <html>.

export type PhotoStampOptions = {
  mode: "caption" | "frame";
  /** The theme's accent color: the caption pill, or the frame. */
  accent: string;
  /** Readable text on top of `accent`. */
  onAccent: string;
  /** What to print, e.g. "Ellen & Brylle · December 25, 2026". */
  text: string;
};

// How long to wait for the heading font before drawing with whatever the
// browser has. A capture must never stall on a slow font download.
const FONT_WAIT_MS = 600;

type Font = { css: (px: number) => string; scale: number };

// The heading font the page itself is using, so the stamp matches the event
// name above the camera. `--font-heading` has its next/font variables already
// substituted by the time it is read back from the computed style.
function headingFont(): Font {
  const style = getComputedStyle(document.documentElement);
  const family = style.getPropertyValue("--font-heading").trim() || "Arial, Helvetica, sans-serif";
  const weight = style.getPropertyValue("--heading-weight").trim() || "700";
  const scale = parseFloat(style.getPropertyValue("--heading-scale")) || 1;

  return { css: (px) => `${weight} ${Math.round(px)}px ${family}`, scale };
}

async function ensureFontLoaded(font: Font, text: string): Promise<void> {
  if (!document.fonts) return;
  try {
    await Promise.race([
      document.fonts.load(font.css(32), text),
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
  font: Font,
  text: string,
  maxWidth: number,
  startPx: number,
  minPx: number,
): { text: string; px: number } {
  let px = startPx;
  ctx.font = font.css(px);
  while (ctx.measureText(text).width > maxWidth && px > minPx) {
    px *= 0.94;
    ctx.font = font.css(px);
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

// Returns the canvas to save: the same one, drawn on, for a caption; a new,
// larger one for a frame (the border goes around the photo rather than over
// it, so nothing in the shot is covered).
export async function applyPhotoStamp(source: HTMLCanvasElement, options: PhotoStampOptions): Promise<HTMLCanvasElement> {
  const font = headingFont();
  await ensureFontLoaded(font, options.text);

  const { width: w, height: h } = source;
  // Everything is sized from the photo's shorter side, so a stamp looks the
  // same on a portrait shot, a landscape one, and at any camera resolution.
  const unit = Math.min(w, h);

  if (options.mode === "frame") {
    const border = Math.round(unit * 0.03);
    const strip = Math.round(unit * 0.12);
    const out = document.createElement("canvas");
    out.width = w + border * 2;
    out.height = h + border + strip;
    const ctx = out.getContext("2d");
    if (!ctx) return source;

    ctx.fillStyle = options.accent;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(source, border, border);

    const { text, px } = fitText(ctx, font, options.text, out.width - border * 4, unit * 0.045 * font.scale, unit * 0.022);
    ctx.font = font.css(px);
    ctx.fillStyle = options.onAccent;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, out.width / 2, border + h + strip / 2);
    return out;
  }

  const ctx = source.getContext("2d");
  if (!ctx) return source;

  const maxPillWidth = w * 0.92;
  const startPx = unit * 0.034 * font.scale;
  const padX = startPx * 0.9;
  const { text, px } = fitText(ctx, font, options.text, maxPillWidth - padX * 2, startPx, unit * 0.02);
  const pillHeight = px * 2;
  const pillWidth = ctx.measureText(text).width + padX * 2;
  const x = (w - pillWidth) / 2;
  const y = h - pillHeight - unit * 0.04;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = px * 0.6;
  ctx.shadowOffsetY = px * 0.15;
  ctx.fillStyle = options.accent;
  ctx.globalAlpha = 0.94;
  roundedRect(ctx, x, y, pillWidth, pillHeight, pillHeight / 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.font = font.css(px);
  ctx.fillStyle = options.onAccent;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, y + pillHeight / 2);
  ctx.restore();

  return source;
}
