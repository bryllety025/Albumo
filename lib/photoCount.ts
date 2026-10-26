"use client";

import { useSyncExternalStore } from "react";

// How many photos the event holds, as the camera knows it: what the server said when the page loaded plus this
// device's own photos still waiting to upload. The camera owns that number (see Camera's `photoCount`); the "photos
// left" note sits further down the page, so the camera publishes the count here and the note reads it.
let published: number | null = null;
const listeners = new Set<() => void>();

/** Called by the camera whenever its count changes; `null` when it goes away, so the note falls back to the server's. */
export function publishPhotoCount(count: number | null) {
  if (count === published) return;
  published = count;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The camera's live count, or `fallback` (what the server said at load) while the camera hasn't published one. */
export function usePublishedPhotoCount(fallback: number): number {
  return useSyncExternalStore(
    subscribe,
    () => published ?? fallback,
    () => fallback,
  );
}
