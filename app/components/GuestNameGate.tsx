"use client";

import { useEffect, useState } from "react";
import { getStoredGuestName, setStoredGuestName } from "@/lib/guestName";

// Asks a guest for their name once per device, the first time they open an
// event's link, so the owner can see who shared each photo. Skippable: an
// empty string is stored either way so this never asks twice.
export default function GuestNameGate() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    if (getStoredGuestName() === null) setOpen(true);
  }, []);

  function close(value: string) {
    setStoredGuestName(value);
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add your name"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
    >
      <div className="w-full max-w-sm rounded-2xl bg-background p-6 text-foreground shadow-xl">
        <h2 className="text-lg font-semibold">What&apos;s your name?</h2>
        <p className="mt-1 text-sm text-gray-500">
          So the host knows who shared each photo. You can skip this.
        </p>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          maxLength={100}
          autoFocus
          className="mt-4 w-full rounded-xl border border-gray-200 px-4 py-3 text-base text-foreground outline-none focus:border-indigo-500"
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim()) close(name.trim());
          }}
        />
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => close("")}
            className="flex-1 rounded-full border border-gray-200 px-4 py-3 font-medium text-gray-600"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => close(name.trim())}
            disabled={!name.trim()}
            className="flex-1 rounded-full bg-navy-900 px-4 py-3 font-medium text-ivory disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
