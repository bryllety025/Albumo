"use client";

import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { usePhotos } from "@/lib/usePhotos";

const RECENT_COUNT = 10;

export default function RecentPhotosStrip() {
  const files = usePhotos();
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const recent = files ? files.slice(0, RECENT_COUNT) : [];

  const closePreview = useCallback(() => setPreviewIndex(null), []);
  const previewPrev = useCallback(() => {
    setPreviewIndex((i) =>
      i === null ? null : i === 0 ? recent.length - 1 : i - 1
    );
  }, [recent.length]);
  const previewNext = useCallback(() => {
    setPreviewIndex((i) =>
      i === null ? null : i === recent.length - 1 ? 0 : i + 1
    );
  }, [recent.length]);

  if (!files || files.length === 0) return null;

  const previewPhoto = previewIndex !== null ? recent[previewIndex] : null;

  return (
    <div className="mt-6 shrink-0">
      <div className="flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wide text-gray-400">
        <span>Just Added</span>
        <span>{files.length} Total</span>
      </div>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
        {recent.map((file, i) => (
          <button
            key={file.id}
            onClick={() => setPreviewIndex(i)}
            aria-label={`Preview ${file.name}`}
            className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/photos/${file.id}/thumbnail`}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>

      {previewPhoto && (
        <div
          className="fixed inset-0 z-[71] flex items-center justify-center bg-black/70 p-4"
          onClick={closePreview}
        >
          <div
            className="relative flex max-h-[90vh] max-w-4xl items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/photos/${previewPhoto.id}/thumbnail`}
              alt={previewPhoto.name}
              className="max-h-full max-w-full rounded-lg object-contain"
            />

            {recent.length > 1 && (
              <>
                <button
                  onClick={previewPrev}
                  aria-label="Previous photo"
                  className="absolute left-2 rounded-full bg-white/20 p-2 hover:bg-white/30 sm:left-4"
                >
                  <ChevronLeft size={24} className="text-white" strokeWidth={1.75} />
                </button>

                <button
                  onClick={previewNext}
                  aria-label="Next photo"
                  className="absolute right-2 rounded-full bg-white/20 p-2 hover:bg-white/30 sm:right-4"
                >
                  <ChevronRight size={24} className="text-white" strokeWidth={1.75} />
                </button>
              </>
            )}

            <button
              onClick={closePreview}
              aria-label="Close preview"
              className="absolute right-2 top-2 rounded-full bg-white/20 p-2 hover:bg-white/30"
            >
              <X size={20} className="text-white" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
