"use client";

import { Check, Download } from "lucide-react";
import type { DriveFile } from "@/lib/googleDrive";

type PhotoGridProps = {
  photos: DriveFile[];
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onOpenPreview: (index: number) => void;
  onDownload: (id: string, name: string) => void;
};

export default function PhotoGrid({
  photos,
  selectedIds,
  onToggleSelected,
  onOpenPreview,
  onDownload,
}: PhotoGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2 overflow-y-auto p-4">
      {photos.map((photo, i) => {
        const selected = selectedIds.has(photo.id);
        return (
          <div
            key={photo.id}
            className={`relative aspect-square overflow-hidden rounded-lg border-2 ${
              selected ? "border-indigo-600" : "border-transparent"
            }`}
          >
            <button
              onClick={() => onOpenPreview(i)}
              aria-label={`Preview ${photo.name}`}
              className="h-full w-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/photos/${photo.id}/thumbnail`}
                alt={photo.name}
                className="h-full w-full object-cover"
              />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelected(photo.id);
              }}
              aria-label={selected ? "Deselect photo" : "Select photo"}
              className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full ${
                selected ? "bg-indigo-600" : "bg-black/40"
              }`}
            >
              {selected && <Check size={12} strokeWidth={2.5} className="text-ivory" />}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload(photo.id, photo.name);
              }}
              aria-label={`Download ${photo.name}`}
              className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 hover:bg-black/60"
            >
              <Download size={12} strokeWidth={2} className="text-white" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
