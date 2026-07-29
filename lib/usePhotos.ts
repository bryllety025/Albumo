"use client";

import { useEffect, useState } from "react";
import type { PhotoFile } from "@/lib/s3";

const POLL_INTERVAL_MS = 10_000;

// Shared by every landing-page component that needs the photo list, so they
// stay in sync off a single poll instead of each running their own timer.
export function usePhotos(): PhotoFile[] | null {
  const [files, setFiles] = useState<PhotoFile[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetch("/api/photos")
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data: { files: PhotoFile[] }) => {
          if (!cancelled) setFiles(data.files);
        })
        .catch(() => {
          // Keep whatever we already have on a transient poll failure;
          // only fall back to empty if the very first load fails.
          if (!cancelled) setFiles((prev) => prev ?? []);
        });
    };

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return files;
}
