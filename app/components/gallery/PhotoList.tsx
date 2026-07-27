"use client";

import { Check, Download } from "lucide-react";
import type { DriveFile } from "@/lib/googleDrive";

type PhotoListProps = {
  photos: DriveFile[];
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onOpenPreview: (index: number) => void;
  onDownload: (id: string, name: string) => void;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PhotoList({
  photos,
  selectedIds,
  onToggleSelected,
  onOpenPreview,
  onDownload,
}: PhotoListProps) {
  return (
    <div className="flex flex-col divide-y divide-sage-100 overflow-y-auto">
      {photos.map((photo, i) => {
        const selected = selectedIds.has(photo.id);
        return (
          <button
            key={photo.id}
            onClick={() => onOpenPreview(i)}
            className="flex items-center gap-3 px-4 py-3 text-left hover:bg-sage-100/40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/photos/${photo.id}/thumbnail`}
              alt={photo.name}
              className="h-14 w-14 shrink-0 rounded-lg object-cover"
            />

            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium text-sage-900">
                {photo.name}
              </span>
              <span className="text-xs text-sage-700/70">
                {formatDate(photo.createdTime)}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelected(photo.id);
                }}
                aria-label={selected ? "Deselect photo" : "Select photo"}
                className={`flex h-6 w-6 items-center justify-center rounded-full ${
                  selected ? "bg-sage-500" : "bg-black/20"
                }`}
              >
                {selected && (
                  <Check size={13} strokeWidth={2.5} className="text-ivory" />
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload(photo.id, photo.name);
                }}
                aria-label={`Download ${photo.name}`}
                className="rounded-full p-2 text-sage-700 hover:bg-sage-100"
              >
                <Download size={18} strokeWidth={1.75} />
              </button>
            </div>
          </button>
        );
      })}
    </div>
  );
}
