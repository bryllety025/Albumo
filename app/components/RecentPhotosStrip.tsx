"use client";

import { useEffect, useState } from "react";
import type { DriveFile } from "@/lib/googleDrive";

const RECENT_COUNT = 10;

export default function RecentPhotosStrip() {
  const [files, setFiles] = useState<DriveFile[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/photos")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { files: DriveFile[] }) => {
        if (!cancelled) setFiles(data.files);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!files || files.length === 0) return null;

  const recent = files.slice(0, RECENT_COUNT);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wide text-gray-400">
        <span>Just Added</span>
        <span>{files.length} Total</span>
      </div>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
        {recent.map((file) => (
          <div
            key={file.id}
            className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/photos/${file.id}/thumbnail`}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
