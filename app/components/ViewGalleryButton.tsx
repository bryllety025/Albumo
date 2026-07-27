"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutGrid, ChevronRight } from "lucide-react";

export default function ViewGalleryButton() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/photos")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { files: { id: string }[] }) => {
        if (!cancelled) setCount(data.files.length);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
