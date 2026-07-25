"use client";

import { useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

type PhotoGalleryProps = {
  photos: string[];
  onClose: () => void;
};

export default function PhotoGallery({ photos, onClose }: PhotoGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handlePrevious = () => {
    if (selectedIndex === null) return;
    setSelectedIndex(selectedIndex === 0 ? photos.length - 1 : selectedIndex - 1);
  };

  const handleNext = () => {
    if (selectedIndex === null) return;
    setSelectedIndex(selectedIndex === photos.length - 1 ? 0 : selectedIndex + 1);
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-camera-bg text-ivory">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="px-2 text-sm font-medium">Your Photos</span>
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
      ) : (
        <>
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

          {selectedIndex !== null && (
            <div
              className="fixed inset-0 z-[71] flex items-center justify-center bg-black/70 p-4"
              onClick={() => setSelectedIndex(null)}
            >
              <div
                className="relative flex max-h-[90vh] max-w-4xl items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photos[selectedIndex]}
                  alt="Photo preview"
                  className="max-h-full max-w-full rounded-lg object-contain"
                />

                <button
                  onClick={handlePrevious}
                  aria-label="Previous photo"
                  className="absolute left-2 rounded-full bg-white/20 p-2 hover:bg-white/30 sm:left-4"
                >
                  <ChevronLeft size={24} className="text-white" strokeWidth={1.75} />
                </button>

                <button
                  onClick={handleNext}
                  aria-label="Next photo"
                  className="absolute right-2 rounded-full bg-white/20 p-2 hover:bg-white/30 sm:right-4"
                >
                  <ChevronRight size={24} className="text-white" strokeWidth={1.75} />
                </button>

                <button
                  onClick={() => setSelectedIndex(null)}
                  aria-label="Close preview"
                  className="absolute right-2 top-2 rounded-full bg-white/20 p-2 hover:bg-white/30"
                >
                  <X size={20} className="text-white" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
