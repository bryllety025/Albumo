import { Camera as CameraIcon } from "lucide-react";
import type { EventAppearance } from "@/lib/theme";

// Font size (px, before the heading style's own scale) for a monogram of
// 1..5 characters, so it always fits the tile.
const MONOGRAM_FONT_PX = [0, 40, 40, 34, 28, 24];

const TILE_CLASSES =
  "flex h-24 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-600/30";

// What sits at the top of the guest page: the owner's cover photo or monogram
// if they chose one (and it exists), the Albumo camera icon otherwise.
export default function EventHero({ theme }: { theme: EventAppearance | null }) {
  if (theme?.hero === "cover" && theme.coverImage) {
    return (
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-gray-100 shadow-lg shadow-black/15"
        style={{ aspectRatio: "16 / 10" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/cover?v=${theme.coverImage}`}
          alt=""
          decoding="async"
          fetchPriority="high"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  if (theme?.hero === "monogram" && theme.monogram) {
    const length = Array.from(theme.monogram).length;
    const size = MONOGRAM_FONT_PX[Math.min(length, MONOGRAM_FONT_PX.length - 1)];

    return (
      <div className={`${TILE_CLASSES} min-w-24 max-w-full px-5`}>
        <span
          className="font-display whitespace-nowrap leading-none text-on-accent"
          style={{ fontSize: `calc(${size}px * var(--heading-scale, 1))`, fontWeight: "var(--heading-weight, 700)" }}
        >
          {theme.monogram}
        </span>
      </div>
    );
  }

  return (
    <div className={`${TILE_CLASSES} w-24`}>
      <CameraIcon className="text-on-accent" size={40} strokeWidth={1.75} />
    </div>
  );
}
