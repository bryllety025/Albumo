// Turns any event photo into an Instagram-story-sized (1080x1920) share
// card with a subtle "via Albumo" mark, then hands it to the OS share sheet
// (or downloads it if sharing isn't available). The card is built client-side
// with Canvas so it works for any photo without a server round trip.

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;
const WATERMARK_TEXT = "via Albumo";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load photo"));
    img.src = src;
  });
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Draws `img` into the target box like CSS `object-fit: cover`.
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const scale = Math.max(w / img.width, h / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  ctx.drawImage(img, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
}

function drawWatermark(ctx: CanvasRenderingContext2D) {
  const iconSize = 36;
  const gap = 14;
  const paddingX = 30;
  const paddingY = 18;

  ctx.font = "600 32px Arial, Helvetica, sans-serif";
  const textWidth = ctx.measureText(WATERMARK_TEXT).width;

  const pillWidth = iconSize + gap + textWidth + paddingX * 2;
  const pillHeight = iconSize + paddingY * 2;
  const pillX = (CARD_WIDTH - pillWidth) / 2;
  const pillY = CARD_HEIGHT - pillHeight - 72;

  ctx.save();
  ctx.fillStyle = "rgba(17, 19, 24, 0.55)";
  roundRectPath(ctx, pillX, pillY, pillWidth, pillHeight, pillHeight / 2);
  ctx.fill();

  // Icon badge: a simplified version of the Albumo 2x2 grid mark.
  const iconX = pillX + paddingX;
  const iconY = pillY + paddingY;
  ctx.fillStyle = "#ffffff";
  roundRectPath(ctx, iconX, iconY, iconSize, iconSize, iconSize * 0.32);
  ctx.fill();

  const cell = iconSize * 0.36;
  const cellGap = iconSize * 0.12;
  const gridW = cell * 2 + cellGap;
  const gridX = iconX + (iconSize - gridW) / 2;
  const gridY = iconY + (iconSize - gridW) / 2;
  ctx.fillStyle = "rgba(17, 19, 24, 0.75)";
  roundRectPath(ctx, gridX, gridY, cell, cell, cell * 0.25);
  ctx.fill();
  roundRectPath(ctx, gridX + cell + cellGap, gridY, cell, cell, cell * 0.25);
  ctx.fill();
  roundRectPath(ctx, gridX, gridY + cell + cellGap, cell, cell, cell * 0.25);
  ctx.fill();
  const smallCell = cell * 0.55;
  roundRectPath(
    ctx,
    gridX + cell + cellGap + (cell - smallCell) / 2,
    gridY + cell + cellGap + (cell - smallCell) / 2,
    smallCell,
    smallCell,
    smallCell * 0.3
  );
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(WATERMARK_TEXT, iconX + iconSize + gap, pillY + pillHeight / 2 + 1);
  ctx.restore();
}

// Renders the photo at `photoUrl` onto a 1080x1920 card: a blurred cover
// fill of the photo itself behind a contain-fit, drop-shadowed copy on top,
// with the "via Albumo" mark pinned near the bottom. Returns a PNG blob.
export async function generateStoryCard(photoUrl: string): Promise<Blob> {
  const img = await loadImage(photoUrl);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // Background: a softened, darkened cover-fill of the same photo so any
  // aspect ratio fills the full story frame. Overdraw slightly so the blur
  // doesn't reveal edges.
  ctx.save();
  ctx.filter = "blur(60px) brightness(0.55)";
  drawCover(ctx, img, -60, -60, CARD_WIDTH + 120, CARD_HEIGHT + 120);
  ctx.restore();

  ctx.fillStyle = "rgba(10, 11, 15, 0.2)";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Foreground: the full photo, contain-fit, with rounded corners and a
  // drop shadow so it reads as a card sitting on the background.
  const margin = 56;
  const maxW = CARD_WIDTH - margin * 2;
  const maxH = CARD_HEIGHT - margin * 2 - 180;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const drawX = (CARD_WIDTH - drawW) / 2;
  const drawY = (CARD_HEIGHT - 180 - drawH) / 2;
  const cornerRadius = 32;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#000000";
  roundRectPath(ctx, drawX, drawY, drawW, drawH, cornerRadius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, drawX, drawY, drawW, drawH, cornerRadius);
  ctx.clip();
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.restore();

  drawWatermark(ctx);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to export card"))),
      "image/png"
    );
  });
}

export type ShareCardResult = "shared" | "downloaded" | "cancelled";

// Hands the generated card to the OS share sheet (so e.g. Instagram can
// offer "Add to Story" directly) when available, falling back to a plain
// download otherwise.
export async function shareOrDownloadCard(
  blob: Blob,
  filename: string
): Promise<ShareCardResult> {
  const file = new File([blob], filename, { type: "image/png" });
  const shareData = { files: [file], title: "Albumo", text: "Shared via Albumo" };

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare(shareData)
  ) {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "cancelled";
      }
      // Fall through to download for any other failure (e.g. share target
      // rejected the file type on some Android share sheets).
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return "downloaded";
}
