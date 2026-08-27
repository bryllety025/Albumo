"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LayoutGrid, ChevronRight } from "lucide-react";
import { usePhotos } from "@/lib/usePhotos";
import { getStoredCount, PHOTO_LIMIT } from "@/lib/photoStorage";
import type { PhotoFile } from "@/lib/s3";

const ROTATE_INTERVAL_MS = 5000;

function pickRandomIndex(length: number, exclude: number) {
  if (length <= 1) return 0;
  let index = Math.floor(Math.random() * (length - 1));
  if (index >= exclude) index += 1;
  return index;
}

type Slots = {
  photos: [PhotoFile | null, PhotoFile | null];
  front: 0 | 1;
};

export default function ViewGalleryButton() {
  const files = usePhotos();
  const count = files ? files.length : null;

  // Interval reads through a ref so the 10s photo-list poll (which hands back
  // a fresh array reference each time) doesn't restart the 5s rotation timer.
  const filesRef = useRef<PhotoFile[] | null>(files);
  filesRef.current = files;
  const currentIndexRef = useRef(0);

  const [slots, setSlots] = useState<Slots>({ photos: [null, null], front: 0 });

  const [yourCount, setYourCount] = useState<number | null>(null);
  useEffect(() => {
    setYourCount(getStoredCount());
  }, []);

  useEffect(() => {
    if (!files || files.length === 0 || slots.photos[slots.front]) return;
    const index = Math.floor(Math.random() * files.length);
    currentIndexRef.current = index;
    setSlots((prev) => {
      const photos: [PhotoFile | null, PhotoFile | null] = [null, null];
      photos[prev.front] = files[index];
      return { ...prev, photos };
    });
  }, [files, slots.front, slots.photos]);

  useEffect(() => {
    const interval = setInterval(() => {
      const list = filesRef.current;
      if (!list || list.length < 2) return;
      const nextIndex = pickRandomIndex(list.length, currentIndexRef.current);
      currentIndexRef.current = nextIndex;
      setSlots((prev) => {
        const back = prev.front === 0 ? 1 : 0;
        const photos = [...prev.photos] as [PhotoFile | null, PhotoFile | null];
        photos[back] = list[nextIndex];
        return { photos, front: back };
      });
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const hasPhotos = Boolean(files && files.length > 0);

  if (!hasPhotos) {
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
            {count === null ? "Loading…" : "No photos shared yet"}
          </span>
        </span>
        <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-gray-300" />
      </Link>
    );
  }

  return (
    <Link
      href="/gallery"
      className="group relative flex aspect-square w-full items-end overflow-hidden bg-gray-900"
    >
      {slots.photos.map((photo, i) =>
        photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={`/api/photos/${photo.id}/thumbnail`}
            alt=""
            className={`absolute inset-0 h-full w-full scale-105 object-cover transition-opacity duration-1000 ease-in-out group-hover:scale-110 ${
              slots.front === i ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : null
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

      <div className="relative flex w-full items-center gap-3 px-4 py-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
          <LayoutGrid size={22} strokeWidth={1.75} className="text-white" />
        </span>
        <span className="flex-1">
          <span className="block text-base font-semibold text-white">
            View All Photos
          </span>
          <span className="block text-sm text-white/80">
            {count} photo{count === 1 ? "" : "s"} shared so far
          </span>
          {yourCount !== null && (
            <span className="block text-xs text-white/60">
              You&apos;ve uploaded {Math.min(yourCount, PHOTO_LIMIT)} of {PHOTO_LIMIT}
            </span>
          )}
        </span>
        <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-white/70" />
      </div>
    </Link>
  );
}
