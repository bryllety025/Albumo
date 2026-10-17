// What an event owner can change about how the guest app looks, and how each
// choice turns into CSS. Pure functions only (no React, no browser APIs), so
// the root layout (a Server Component) and the camera (a Client Component)
// can both import it.

export type HeadingFont = "modern" | "elegant" | "playful" | "script" | "bold";
export type BackgroundStyle = "solid" | "gradient" | "dots" | "confetti" | "stripes";
export type HeroStyle = "icon" | "monogram" | "cover";
export type PhotoStamp = "none" | "caption" | "frame";

export type EventTheme = {
  background: string;
  foreground: string;
  accent: string;
  headingFont: HeadingFont;
  backgroundStyle: BackgroundStyle;
  hero: HeroStyle;
  monogram: string | null;
  welcomeMessage: string | null;
  photoStamp: PhotoStamp;
};

/** An event's theme plus its cover photo's file name, as read from albumo-backend. */
export type EventAppearance = EventTheme & { coverImage: string | null };

export const HEADING_FONTS: readonly HeadingFont[] = ["modern", "elegant", "playful", "script", "bold"];
export const BACKGROUND_STYLES: readonly BackgroundStyle[] = ["solid", "gradient", "dots", "confetti", "stripes"];
export const HERO_STYLES: readonly HeroStyle[] = ["icon", "monogram", "cover"];
export const PHOTO_STAMPS: readonly PhotoStamp[] = ["none", "caption", "frame"];

export const MAX_MONOGRAM_LENGTH = 5;
export const MAX_WELCOME_MESSAGE_LENGTH = 200;

/** A cover photo's file name as albumo-backend names it: a UUID and an image extension. */
export const COVER_NAME_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// The family each heading style uses, via the CSS variables next/font declares
// in app/layout.tsx. `scale` evens out how big each face looks at the same
// font-size (a script or condensed face reads small), and `weight` is the one
// weight each is drawn at (Bebas Neue only has a regular, so asking for bold
// would just smear it).
export const HEADING_FONT_STYLES: Record<HeadingFont, { family: string; scale: number; weight: number }> = {
  modern: { family: "Arial, Helvetica, sans-serif", scale: 1, weight: 700 },
  elegant: { family: "var(--font-display-serif), Georgia, serif", scale: 1, weight: 700 },
  playful: { family: "var(--font-fredoka), system-ui, sans-serif", scale: 1, weight: 600 },
  script: { family: "var(--font-dancing-script), cursive", scale: 1.3, weight: 700 },
  bold: { family: "var(--font-bebas-neue), Impact, sans-serif", scale: 1.25, weight: 400 },
};

type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

// WCAG relative luminance, 0 (black) to 1 (white).
function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** Whether a page with this background reads as dark (picks the light logo). */
export function isDarkColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

const DARK_INK = "#111318";
const LIGHT_INK = "#ffffff";

/** The text color (white or near-black) that reads best on top of `hex`. */
export function onColor(hex: string): string {
  const luminance = relativeLuminance(hex);
  const againstLight = 1.05 / (luminance + 0.05);
  const againstDark = (luminance + 0.05) / (relativeLuminance(DARK_INK) + 0.05);
  return againstLight >= againstDark ? LIGHT_INK : DARK_INK;
}

function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function dotsPattern(accent: string): string {
  return svgUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>` +
      `<circle cx='7' cy='7' r='2' fill='${accent}' fill-opacity='0.15'/>` +
      `<circle cx='21' cy='21' r='2' fill='${accent}' fill-opacity='0.15'/>` +
      `</svg>`,
  );
}

function stripesPattern(accent: string): string {
  return svgUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'>` +
      `<path d='M-5 5L5 -5M0 20L20 0M15 25L25 15' stroke='${accent}' stroke-opacity='0.08' stroke-width='2'/>` +
      `</svg>`,
  );
}

function confettiPattern(accent: string, foreground: string): string {
  return svgUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'>` +
      `<rect x='14' y='16' width='12' height='4' rx='1' fill='${accent}' fill-opacity='0.16' transform='rotate(30 20 18)'/>` +
      `<circle cx='62' cy='12' r='3' fill='${foreground}' fill-opacity='0.08'/>` +
      `<rect x='108' y='18' width='4' height='12' rx='1' fill='${accent}' fill-opacity='0.15' transform='rotate(-20 110 24)'/>` +
      `<path d='M30 62l6 10h-12z' fill='${foreground}' fill-opacity='0.08'/>` +
      `<circle cx='82' cy='64' r='4' fill='${accent}' fill-opacity='0.15'/>` +
      `<rect x='112' y='84' width='12' height='4' rx='1' fill='${foreground}' fill-opacity='0.08' transform='rotate(60 118 86)'/>` +
      `<circle cx='14' cy='118' r='2.5' fill='${accent}' fill-opacity='0.15'/>` +
      `<rect x='58' y='110' width='4' height='12' rx='1' fill='${accent}' fill-opacity='0.16' transform='rotate(15 60 116)'/>` +
      `<path d='M100 120l6 10h-12z' fill='${accent}' fill-opacity='0.14'/>` +
      `</svg>`,
  );
}

/** The CSS `background-image` for a theme's background style, or null for a plain color. */
export function backgroundImageFor(theme: EventTheme): string | null {
  const { backgroundStyle, background, foreground, accent } = theme;
  switch (backgroundStyle) {
    case "gradient":
      return `linear-gradient(165deg, ${background} 0%, color-mix(in srgb, ${accent} 16%, ${background}) 100%)`;
    case "dots":
      return dotsPattern(accent);
    case "stripes":
      return stripesPattern(accent);
    case "confetti":
      return confettiPattern(accent, foreground);
    case "solid":
    default:
      return null;
  }
}

// Overrides the palette variables from globals.css on <html>, so every
// surface that already uses them (and the Tailwind indigo/gray classes, which
// resolve through the same variables) picks up the event's theme. Soft shades
// are mixed from the three chosen colors so a custom theme only needs three.
export function themeStyleVars(theme: EventTheme): Record<string, string> {
  const { background, foreground, accent } = theme;
  const font = HEADING_FONT_STYLES[theme.headingFont];
  const soft = `color-mix(in srgb, ${accent} 18%, ${background})`;

  const vars: Record<string, string> = {
    "--background": background,
    "--foreground": foreground,
    "--color-indigo-600": accent,
    "--color-indigo-400": `color-mix(in srgb, ${accent} 65%, ${background})`,
    "--color-indigo-500": `color-mix(in srgb, ${accent} 85%, ${background})`,
    "--color-indigo-100": soft,
    // The secondary action icons use blue; on a themed page they follow the accent.
    "--color-blue-600": accent,
    "--color-blue-100": soft,
    // A page-colored card would vanish into the page, so a surface sits a step apart from it:
    // nearly white on a light theme (still tinted by it), a touch lighter than the page on a dark one.
    "--color-surface": isDarkColor(background)
      ? `color-mix(in srgb, #ffffff 7%, ${background})`
      : `color-mix(in srgb, ${background} 35%, #ffffff)`,
    "--color-gray-50": `color-mix(in srgb, ${foreground} 5%, ${background})`,
    "--color-gray-100": `color-mix(in srgb, ${foreground} 9%, ${background})`,
    "--color-gray-300": `color-mix(in srgb, ${foreground} 25%, ${background})`,
    "--color-gray-400": `color-mix(in srgb, ${foreground} 45%, ${background})`,
    "--color-gray-500": `color-mix(in srgb, ${foreground} 60%, ${background})`,
    "--color-gray-600": `color-mix(in srgb, ${foreground} 75%, ${background})`,
    // What sits on top of an accent-filled button or badge: white, unless the accent is light.
    "--color-on-accent": onColor(accent),
    "--font-heading": font.family,
    "--heading-scale": String(font.scale),
    "--heading-weight": String(font.weight),
  };

  const image = backgroundImageFor(theme);
  if (image) vars["--page-bg-image"] = image;

  return vars;
}
