"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Camera,
  CircleHelp,
  LayoutGrid,
  PartyPopper,
  SlidersHorizontal,
  UploadCloud,
  X,
  type LucideIcon,
} from "lucide-react";
import { facebookFollowUrl } from "@/lib/facebook";
import { GUEST_NAME_SET_EVENT, getStoredGuestName } from "@/lib/guestName";
import { hasSeenHowToUse, markHowToUseSeen } from "@/lib/howToUse";

type Step = { icon: LucideIcon; title: string; body: ReactNode };

function Em({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

// lucide dropped its brand icons, so Facebook's own "f" mark is drawn here.
function FacebookMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

// Every step but the last, which is the Facebook ask and is laid out by hand
// below. Only describes what the app really does.
function buildSteps(photoLimit: number | null, canTakePhoto: boolean): Step[] {
  return [
    {
      icon: Camera,
      title: "Add your photos",
      body: canTakePhoto ? (
        <>
          Tap <Em>Take Photo</Em> to open your camera, or <Em>Choose Photo</Em> to pick pictures from your camera
          roll. Everything you add joins the shared album right away.
        </>
      ) : (
        <>
          The camera is only open on the day of the event, but you can still tap <Em>Choose Photo</Em> to pick
          pictures from your camera roll. Everything you add joins the shared album right away.
        </>
      ),
    },
    // The camera's own controls are only worth explaining while the camera is there.
    ...(canTakePhoto
      ? [
          {
            icon: SlidersHorizontal,
            title: "Shoot your way",
            body: (
              <>
                Along the top of the camera you can switch cameras and turn on flash, HDR or burst mode. Filters,
                the timer and zoom are along the bottom. Tap the big circle to shoot.
              </>
            ),
          },
        ]
      : []),
    {
      icon: UploadCloud,
      title: "Save to share",
      body: (
        <>
          Check your photo, then tap <Em>Save</Em>, or <Em>Try again</Em> for a new one. Photos upload in the
          background, so you can keep shooting.
          {photoLimit !== null && <> This album holds up to {photoLimit} photos in total, shared by everyone.</>}
        </>
      ),
    },
    {
      icon: LayoutGrid,
      title: "See everyone's photos",
      body: (
        <>
          Tap <Em>View All Photos</Em> to watch the album fill up. Once you&apos;ve shared some, <Em>My Photos</Em>{" "}
          lets you view, download or delete yours.
        </>
      ),
    },
  ];
}

type Props = {
  /** The most photos the whole event may hold. Null means this event has no photo limit. */
  photoLimit: number | null;
  /** The admin's Facebook link; without one the walkthrough ends on a plain "all set" step. */
  facebookUrl: string | null;
  /** Whether the camera is open; after the event's own day only the camera roll is, and the walkthrough says so. */
  canTakePhoto: boolean;
};

// A short walkthrough that opens by itself the first time a guest opens the
// app on a device (once the name prompt has been dealt with, so the two never
// stack) and ends by asking them to follow Albumo on Facebook. The link it
// renders lets anyone replay it later.
export default function HowToUse({ photoLimit, facebookUrl, canTakePhoto }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const titleId = useId();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openedByHandRef = useRef(false);

  useEffect(() => {
    if (hasSeenHowToUse()) return;

    function show() {
      setOpen(true);
    }

    // A first-time guest is asked for their name first; wait for the answer
    // (saved or skipped) instead of opening on top of that dialog. One who has
    // already answered gets a moment to see the page before it opens.
    if (getStoredGuestName() !== null) {
      const timer = setTimeout(show, 400);
      return () => clearTimeout(timer);
    }
    window.addEventListener(GUEST_NAME_SET_EVENT, show, { once: true });
    return () => window.removeEventListener(GUEST_NAME_SET_EVENT, show);
  }, []);

  const close = useCallback(() => {
    markHowToUseSeen();
    setOpen(false);
    if (openedByHandRef.current) {
      openedByHandRef.current = false;
      triggerRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  // Keep keyboard focus on the main button as the steps change.
  useEffect(() => {
    if (open) primaryRef.current?.focus();
  }, [open, step]);

  function replay() {
    openedByHandRef.current = true;
    setStep(0);
    setOpen(true);
  }

  const steps = buildSteps(photoLimit, canTakePhoto);
  const followUrl = facebookUrl ? facebookFollowUrl(facebookUrl) : null;
  const total = steps.length + 1;
  const isLast = step === total - 1;
  const current = isLast ? null : steps[step];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={replay}
        className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-gray-500"
      >
        <CircleHelp size={13} strokeWidth={1.75} />
        How to use
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
        >
          <div className="relative max-h-full w-full max-w-sm overflow-y-auto rounded-2xl bg-background p-6 text-foreground shadow-xl">
            <button
              type="button"
              onClick={close}
              aria-label="Close how to use"
              className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-foreground"
            >
              <X size={18} strokeWidth={1.75} />
            </button>

            <div className="flex min-h-64 flex-col justify-center">
              {current ? (
                <div className="text-center">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                    <current.icon size={28} strokeWidth={1.75} />
                  </span>
                  <h2 id={titleId} className="mt-4 text-xl font-semibold">
                    {current.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">{current.body}</p>
                </div>
              ) : followUrl ? (
                // The last step: the one thing the walkthrough most wants a guest to do, so it gets a card
                // in Facebook's own blue, with a soft glow, instead of the plain layout above. It's wider than
                // the other steps' content, so it starts below the close button instead of running under it.
                <div className="relative mt-6">
                  <div
                    aria-hidden="true"
                    className="absolute -inset-1.5 rounded-3xl bg-[#1877F2]/35 blur-md motion-safe:animate-pulse"
                  />
                  <div className="relative rounded-2xl bg-[#1877F2] p-5 text-center text-white shadow-lg ring-2 ring-white/40">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#1877F2]">
                      <FacebookMark className="h-10 w-10" />
                    </span>
                    <h2 id={titleId} className="mt-3 text-xl font-bold leading-snug">
                      Please follow us on Facebook!
                    </h2>
                    <p className="mt-1.5 text-sm text-white/90">
                      Follow our page to keep up with Albumo and see what&apos;s new.
                    </p>
                    <a
                      href={followUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-base font-semibold text-[#1877F2] transition-colors hover:bg-white/90"
                    >
                      <FacebookMark className="h-5 w-5" />
                      Follow us on Facebook
                    </a>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                    <PartyPopper size={28} strokeWidth={1.75} />
                  </span>
                  <h2 id={titleId} className="mt-4 text-xl font-semibold">
                    You&apos;re all set!
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">
                    Enjoy the event, and thanks for sharing your photos.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-center gap-1.5" aria-hidden="true">
              {Array.from({ length: total }, (_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? "w-5 bg-indigo-600" : "w-1.5 bg-gray-300"
                  }`}
                />
              ))}
            </div>
            <p className="sr-only">
              Step {step + 1} of {total}
            </p>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={step === 0 ? close : () => setStep(step - 1)}
                className="flex-1 rounded-full border border-gray-200 px-4 py-3 font-medium text-gray-600"
              >
                {step === 0 ? "Skip" : "Back"}
              </button>
              <button
                ref={primaryRef}
                type="button"
                onClick={isLast ? close : () => setStep(step + 1)}
                className="flex-1 rounded-full bg-navy-900 px-4 py-3 font-medium text-ivory"
              >
                {isLast ? "Done" : "Next"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
