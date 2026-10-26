"use client";

import { usePublishedPhotoCount } from "@/lib/photoCount";

/**
 * "597 of 600 photos left for this event", under the Just Added strip. Only while photos can still be added: once the
 * album is full the camera card says so itself, and while sharing is closed or paused there is nothing left to count.
 */
export default function PhotoLimitNote({
  photoLimit,
  photosUsed,
  canUpload,
}: {
  /** The most photos the whole event may hold; null means unlimited. */
  photoLimit: number | null;
  /** How many it held when the page loaded. */
  photosUsed: number;
  canUpload: boolean;
}) {
  const used = usePublishedPhotoCount(photosUsed);

  if (photoLimit === null || !canUpload) return null;
  const remaining = Math.max(photoLimit - used, 0);
  if (remaining <= 0) return null;

  return (
    <p className="mt-4 shrink-0 text-center text-xs text-gray-500">
      {remaining} of {photoLimit} photo{photoLimit === 1 ? "" : "s"} left for this event
    </p>
  );
}
