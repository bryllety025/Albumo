"use client";

import { useState } from "react";
import { X, ArrowLeft } from "lucide-react";

type PhotoGalleryProps = {
  photos: string[];
  onClose: () => void;
};

export default function PhotoGallery({ photos, onClose }: PhotoGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-camera-bg text-ivory">
      <div className="flex items-center justify-between px-4 py-3">
        {selectedIndex !== null ? (
          <button
            onClick={() => setSelectedIndex(null)}
            aria-label="Back to all photos"
            className="rounded-full p-2 hover:bg-ivory/10"
          >
            <ArrowLeft size={20} strokeWidth={1.75} />
          </button>
        ) : (
          <span className="px-2 text-sm font-medium">Your Photos</span>
        )}
        <button
          onClick={onClose}
          aria-label="Close gallery"
          className="rounded-full p-2 hover:bg-ivory/10"
        >
          <X size={20} strokeWidth={1.75} />
        </button>
      </div>

      {photos.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-ivory/70">No photos yet</p>
        </div>
      ) : selectedIndex !== null ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[selectedIndex]}
            alt="Photo preview"
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto p-4">
          {photos.map((photo, i) => (
            <button
              key={i}
              onClick={() => setSelectedIndex(i)}
              className="relative aspect-square overflow-hidden rounded-lg"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo}
                alt={`Saved photo ${i + 1}`}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
