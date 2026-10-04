"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { getStoredGuestName, setStoredGuestName } from "@/lib/guestName";

// Asks a guest for their name once per device, the first time they open an
// event's link, so the owner can see who shared each photo. Skippable: an
// empty string is stored either way so this never asks twice on its own —
// afterwards, the inline greeting/"Add your name" control below lets the
// guest open the same dialog again to set or change it.
export default function GuestNameGate() {
  // null here doubles as "haven't checked storage yet" during the first
  // render and "never asked" once the effect below has run; both render the
  // same way (nothing, until the dialog opens), so no extra state is needed
  // to tell them apart.
  const [storedName, setStoredNameValue] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const isFirstAsk = storedName === null;

  useEffect(() => {
    const stored = getStoredGuestName();
    setStoredNameValue(stored);
    if (stored === null) setOpen(true);
  }, []);

  function openDialog() {
    setDraftName(storedName ?? "");
    setOpen(true);
  }

  function handleSkip() {
    setStoredGuestName("");
    setStoredNameValue("");
    setOpen(false);
  }

  function handleCancel() {
    setOpen(false);
  }

  function handleSave(value: string) {
    setStoredGuestName(value);
    setStoredNameValue(value);
    setOpen(false);
  }

  return (
    <>
      {storedName ? (
        <div className="flex items-center gap-1.5 text-sm font-medium text-indigo-600">
          <span>Hi, {storedName}!</span>
          <button
            type="button"
            onClick={openDialog}
            aria-label="Edit your name"
            className="text-indigo-400 hover:text-indigo-600"
          >
            <Pencil size={14} strokeWidth={1.75} />
          </button>
        </div>
      ) : storedName === "" ? (
        <button
          type="button"
          onClick={openDialog}
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 underline underline-offset-2"
        >
          <Pencil size={13} strokeWidth={1.75} />
          Add your name
        </button>
      ) : null}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isFirstAsk ? "Add your name" : "Update your name"}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
        >
          <div className="w-full max-w-sm rounded-2xl bg-background p-6 text-foreground shadow-xl">
            <h2 className="text-lg font-semibold">
              {isFirstAsk ? "What’s your name?" : "Update your name"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {isFirstAsk
                ? "So the host knows who shared each photo. You can skip this."
                : "This is the name that'll show up on photos you share next."}
            </p>
            <input
              type="text"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Your name"
              maxLength={100}
              autoFocus
              className="mt-4 w-full rounded-xl border border-gray-200 px-4 py-3 text-base text-foreground outline-none focus:border-indigo-500"
              onKeyDown={(event) => {
                if (event.key === "Enter" && draftName.trim()) handleSave(draftName.trim());
              }}
            />
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={isFirstAsk ? handleSkip : handleCancel}
                className="flex-1 rounded-full border border-gray-200 px-4 py-3 font-medium text-gray-600"
              >
                {isFirstAsk ? "Skip" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => handleSave(draftName.trim())}
                disabled={!draftName.trim()}
                className="flex-1 rounded-full bg-navy-900 px-4 py-3 font-medium text-ivory disabled:opacity-40"
              >
                {isFirstAsk ? "Continue" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
