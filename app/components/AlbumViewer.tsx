"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { albumPageUrl } from "@/lib/album";

// The book as the event owner sees it when they make it: the cover on its own, then facing pages, then the
// back cover on its own, and a page turns with a swing around the spine. On a narrow screen (a phone) there is
// room for one page at a time, and the next one slides in over the last.

/** What is on show at once: a left page and a right page, either of which may be missing. */
type View = { l: number | null; r: number | null };

const FLIP_MS = 720;
const SLIDE_MS = 380;
// Wide enough for two pages side by side.
const WIDE_QUERY = "(min-width: 720px)";

function buildViews(total: number, wide: boolean): View[] {
  const views: View[] = [];
  if (!wide) {
    for (let i = 0; i < total; i++) views.push({ l: i, r: null });
    return views;
  }
  views.push({ l: null, r: 0 });
  for (let p = 1; p < total - 1; p += 2) views.push({ l: p, r: p + 1 <= total - 2 ? p + 1 : null });
  if (total > 1) views.push({ l: total - 1, r: null });
  return views;
}

function viewOfPage(views: View[], index: number): number {
  const found = views.findIndex((view) => view.l === index || view.r === index);
  return found === -1 ? 0 : found;
}

function describe(view: View, total: number): string {
  const inner = Math.max(0, total - 2);
  const pages = [view.l, view.r].filter((page): page is number => page !== null);
  if (pages.length === 1 && pages[0] === 0) return "Cover";
  if (pages.length === 1 && pages[0] === total - 1) return "Back cover";
  if (pages.length === 1) return `Page ${pages[0]} of ${inner}`;
  return `Pages ${pages[0]}–${pages[1]} of ${inner}`;
}

// A lone cover sits on the right of the open book and a lone back cover on the left, so the book slides over to
// keep whichever is showing in the middle.
function shiftFor(view: View, wide: boolean): string {
  if (!wide) return "none";
  return `translateX(${view.l === null ? -25 : view.r === null ? 25 : 0}%)`;
}

function subscribeToWide(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

type Animation = {
  kind: "flip" | "slide";
  /** 1 going forward, -1 back. */
  dir: 1 | -1;
  from: View;
  to: View;
  /** False for the first frame, so that the move to the end position has something to animate from. */
  turned: boolean;
};

/** One page's picture. `spine` is the edge it curves into, which gets a soft shadow. */
function Sheet({
  albumId,
  publishedAt,
  index,
  total,
  spine,
}: {
  albumId: string;
  publishedAt: string;
  index: number | null;
  total: number;
  spine: "left" | "right" | null;
}) {
  // How many times the picture has been asked for again after it failed to load.
  const [tries, setTries] = useState(0);
  const [failed, setFailed] = useState(false);
  const label = index === 0 ? "The cover" : index === total - 1 ? "The back cover" : `Page ${index}`;

  return (
    <div className={`ab-sheet${spine ? ` ab-spine-${spine}` : ""}`}>
      {index !== null &&
        (failed ? (
          <button
            type="button"
            // A tap here is a tap on the page, not a turn of it.
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setFailed(false);
              setTries((n) => n + 1);
            }}
            className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center text-xs text-gray-500"
          >
            <span>This page didn&apos;t load.</span>
            <span className="font-medium text-indigo-600 underline">Tap to try again</span>
          </button>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={albumPageUrl(albumId, index, publishedAt, tries)}
            alt={label}
            draggable={false}
            onError={() => setFailed(true)}
          />
        ))}
    </div>
  );
}

export default function AlbumViewer({
  albumId,
  title,
  pageCount,
  publishedAt,
}: {
  albumId: string;
  title: string;
  pageCount: number;
  publishedAt: string;
}) {
  const wide = useSyncExternalStore(
    subscribeToWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false
  );
  const views = useMemo(() => buildViews(pageCount, wide), [pageCount, wide]);

  // The page on show (its left one, or its right if that is all there is). Kept as a page rather than as a view
  // so that the screen changing between one page at a time and two doesn't lose your place.
  const [page, setPage] = useState(0);
  const viewIndex = viewOfPage(views, page);
  const view = views[viewIndex];
  const [animation, setAnimation] = useState<Animation | null>(null);

  // One page's width over its height, learned from the cover.
  const [aspect, setAspect] = useState<number | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const [coverTries, setCoverTries] = useState(0);
  useEffect(() => {
    const image = new Image();
    image.onload = () => setAspect(image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 0.8);
    image.onerror = () => setCoverFailed(true);
    image.src = albumPageUrl(albumId, 0, publishedAt, coverTries);
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [albumId, publishedAt, coverTries]);

  // The room the book has, measured, so it takes as much as it can without scrolling.
  const mainRef = useRef<HTMLElement>(null);
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const element = mainRef.current;
    if (!element) return;
    const measure = () => setRoom({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [aspect]);

  const stage = useMemo(() => {
    if (!aspect || !room) return null;
    // `main` has 12px of padding on every side.
    const availableWidth = Math.max(0, room.width - 24);
    const availableHeight = Math.max(0, room.height - 12);
    const width = Math.max(120, wide ? Math.min(availableWidth, availableHeight * aspect * 2) : Math.min(availableWidth, availableHeight * aspect));
    return { width, height: Math.max(120, wide ? width / (aspect * 2) : width / aspect) };
  }, [aspect, room, wide]);

  const go = useCallback(
    (to: number) => {
      if (animation || to < 0 || to >= views.length || to === viewIndex) return;
      const destination = views[to];
      setPage(destination.l ?? destination.r ?? 0);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || Math.abs(to - viewIndex) !== 1) return;
      setAnimation({ kind: wide ? "flip" : "slide", dir: to > viewIndex ? 1 : -1, from: view, to: destination, turned: false });
    },
    [animation, views, viewIndex, view, wide]
  );

  // A turn starts from the first frame's positions, moves to the last on the next, and is over a moment after
  // the movement's own time is up.
  const animationKey = animation ? `${animation.kind}:${animation.from.l}:${animation.from.r}>${animation.to.l}:${animation.to.r}` : null;
  const animationKind = animation?.kind ?? null;
  useEffect(() => {
    if (!animationKey) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setAnimation((current) => (current && !current.turned ? { ...current, turned: true } : current)));
    });
    const done = setTimeout(() => setAnimation(null), (animationKind === "flip" ? FLIP_MS : SLIDE_MS) + 60);
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      clearTimeout(done);
    };
  }, [animationKey, animationKind]);

  // The pictures just ahead and behind are fetched before they are needed, so a turn doesn't land on blanks.
  useEffect(() => {
    for (const around of [viewIndex - 1, viewIndex + 1, viewIndex + 2]) {
      const near = views[around];
      if (!near) continue;
      for (const index of [near.l, near.r]) {
        if (index !== null) new Image().src = albumPageUrl(albumId, index, publishedAt);
      }
    }
  }, [views, viewIndex, albumId, publishedAt]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        go(viewIndex + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        go(viewIndex - 1);
      } else if (event.key === "Home") go(0);
      else if (event.key === "End") go(views.length - 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [go, viewIndex, views.length]);

  // Tapping the right half of the book turns forward and the left half back; a swipe does the same.
  const swipeStart = useRef<number | null>(null);
  const swiped = useRef(false);

  const sheet = (index: number | null, spine: "left" | "right" | null) => (
    <Sheet albumId={albumId} publishedAt={publishedAt} index={index} total={pageCount} spine={spine} />
  );
  const pageAt = (index: number | null, side: "left" | "right") =>
    index === null ? null : (
      <div key={`page-${index}`} className="ab-page" style={{ left: side === "left" ? 0 : "50%" }}>
        {sheet(index, side === "left" ? "right" : "left")}
      </div>
    );

  function book() {
    if (!animation) {
      if (!wide) return <div key={`page-${view.l}`} className="ab-page">{sheet(view.l, null)}</div>;
      return (
        <>
          {pageAt(view.l, "left")}
          {pageAt(view.r, "right")}
        </>
      );
    }

    const { from, to, dir, turned } = animation;
    if (animation.kind === "slide") {
      return (
        <>
          <div className="ab-slide" style={{ transform: turned ? `translateX(${-dir * 40}%)` : "none", opacity: turned ? 0 : 1 }}>
            {sheet(from.l, null)}
          </div>
          <div className="ab-slide" style={{ transform: turned ? "translateX(0)" : `translateX(${dir * 100}%)`, opacity: turned ? 1 : 0.4 }}>
            {sheet(to.l, null)}
          </div>
        </>
      );
    }

    // A leaf hinged on the spine: the page that is lifting on its front, the one that lands on its back. Going
    // forward the right-hand page lifts and swings over (under it is the new right-hand page, and on the left the
    // old one waits); going back it is the left-hand page that swings.
    const forward = dir === 1;
    return (
      <>
        {pageAt(forward ? from.l : to.l, "left")}
        {pageAt(forward ? to.r : from.r, "right")}
        <div
          className="ab-leaf"
          style={{
            left: forward ? "50%" : 0,
            transformOrigin: forward ? "left center" : "right center",
            transform: turned ? `rotateY(${forward ? -180 : 180}deg)` : "none",
          }}
        >
          <div className="ab-face">{sheet(forward ? from.r : from.l, forward ? "left" : "right")}</div>
          <div className="ab-face ab-face-back">{sheet(forward ? to.l : to.r, forward ? "right" : "left")}</div>
        </div>
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-foreground">
      <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 justify-self-start rounded-full px-2 py-2 text-sm font-medium text-foreground hover:bg-foreground/10"
        >
          <ArrowLeft size={18} strokeWidth={1.75} />
          Back
        </Link>
        <h1
          className="font-display max-w-[56vw] truncate text-center text-base tracking-tight"
          style={{ fontWeight: "var(--heading-weight, 700)" }}
        >
          {title || "Photo album"}
        </h1>
        <span aria-hidden="true" />
      </div>

      {/* The book slides sideways to keep a lone cover in the middle, which leaves its empty half past the edge of
          the screen: clipped, so that a phone has nothing to pan to. */}
      <main ref={mainRef} className="flex min-h-0 flex-1 items-center justify-center overflow-x-clip px-3 py-1.5">
        {coverFailed ? (
          <div className="flex max-w-xs flex-col items-center gap-3 text-center">
            <p className="text-sm text-gray-500">The album couldn&apos;t be loaded. Check your connection and try again.</p>
            <button
              type="button"
              onClick={() => {
                setCoverFailed(false);
                setCoverTries((n) => n + 1);
              }}
              className="rounded-full bg-foreground/10 px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/20"
            >
              Try again
            </button>
          </div>
        ) : !stage ? (
          <Loader2 size={28} strokeWidth={1.75} className="animate-spin text-gray-400" aria-label="Loading the album" />
        ) : (
          <div
            className={`ab-stage${wide ? "" : " ab-single"}`}
            style={{ width: stage.width, height: stage.height }}
            aria-label="The album: tap the right or left side, swipe, or use the arrow keys, to turn the page"
            onPointerDown={(e) => {
              swipeStart.current = e.clientX;
              swiped.current = false;
            }}
            onPointerUp={(e) => {
              if (swipeStart.current === null) return;
              const dx = e.clientX - swipeStart.current;
              swipeStart.current = null;
              if (Math.abs(dx) > 50) {
                swiped.current = true;
                go(dx < 0 ? viewIndex + 1 : viewIndex - 1);
              }
            }}
            onClick={(e) => {
              // The click that ends a swipe has already turned the page.
              if (swiped.current) {
                swiped.current = false;
                return;
              }
              const box = e.currentTarget.getBoundingClientRect();
              go(e.clientX - box.left > box.width / 2 ? viewIndex + 1 : viewIndex - 1);
            }}
          >
            <div className="ab-book" style={{ transform: shiftFor(animation ? animation.to : view, wide) }}>
              {book()}
            </div>
          </div>
        )}
      </main>

      <div className="flex shrink-0 items-center justify-center gap-2.5 px-3 pb-5 pt-2">
        <button
          type="button"
          onClick={() => go(viewIndex - 1)}
          disabled={viewIndex === 0}
          aria-label="Previous pages"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-foreground/10 text-foreground hover:bg-foreground/20 disabled:opacity-30"
        >
          <ChevronLeft size={22} strokeWidth={1.75} />
        </button>
        <p className="min-w-40 text-center text-sm font-semibold" aria-live="polite">
          {describe(view, pageCount)}
        </p>
        <button
          type="button"
          onClick={() => go(viewIndex + 1)}
          disabled={viewIndex >= views.length - 1}
          aria-label="Next pages"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-foreground/10 text-foreground hover:bg-foreground/20 disabled:opacity-30"
        >
          <ChevronRight size={22} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
