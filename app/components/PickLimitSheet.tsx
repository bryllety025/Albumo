"use client";

import { useEffect, useId, useRef } from "react";
import { MAX_PHOTOS_PER_UPLOAD } from "@/lib/photoBatch";

type Props = {
  open: boolean;
  /** The guest read it and wants to pick: the caller opens the phone's photo picker. */
  onChoose: () => void;
  onClose: () => void;
};

// Shown before the phone's photo picker opens (see lib/photoBatch.ts for why it has to be before): a web page
// can't stop a guest from ticking more photos than can be shared at once, so this is what keeps them from
// spending a minute on 30 photos only to be told that 5 can go.
export default function PickLimitSheet({ open, onChoose, onClose }: Props) {
  const titleId = useId();
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
    >
      <div className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl bg-background p-6 text-center text-foreground shadow-xl">
        <span
          aria-hidden="true"
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-4xl font-bold text-indigo-600"
        >
          {MAX_PHOTOS_PER_UPLOAD}
        </span>
        <h2 id={titleId} className="mt-4 text-xl font-semibold">
          Pick up to {MAX_PHOTOS_PER_UPLOAD} photos at a time
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          Tap the photos you want to share, then confirm. Want to share more? Pick the next {MAX_PHOTOS_PER_UPLOAD}{" "}
          right after, and they&apos;ll upload one after another.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            ref={primaryRef}
            type="button"
            onClick={onChoose}
            className="w-full rounded-full bg-indigo-600 px-5 py-3.5 text-base font-medium text-on-accent transition-colors hover:bg-indigo-500 active:bg-indigo-500"
          >
            Choose photos
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full px-5 py-3 text-base text-gray-500 transition-colors hover:bg-gray-100 hover:text-foreground"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
