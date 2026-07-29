"use client";

import Link from "next/link";
import { LayoutGrid, ChevronRight } from "lucide-react";
import { usePhotos } from "@/lib/usePhotos";

export default function ViewGalleryButton() {
  const files = usePhotos();
  const count = files ? files.length : null;

  return (
    <Link
      href="/gallery"
      className="flex items-center gap-3 bg-gray-50 px-4 py-4 transition-colors hover:bg-gray-100"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100">
        <LayoutGrid size={22} strokeWidth={1.75} className="text-gray-600" />
      </span>
      <span className="flex-1">
        <span className="block text-base font-semibold text-foreground">
          View All Photos
        </span>
        <span className="block text-sm text-gray-500">
          {count === null ? "Loading…" : `${count} photo${count === 1 ? "" : "s"} shared so far`}
        </span>
      </span>
      <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-gray-300" />
    </Link>
  );
}
