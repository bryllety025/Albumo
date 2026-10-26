"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutGrid,
  List,
  Loader2,
  Share2,
  X,
} from "lucide-react";
import type { PhotoFile } from "@/lib/s3";
import { generateStoryCard, shareOrDownloadCard } from "@/lib/shareCard";
import { TooltipLabel } from "./tooltip-label";
import PhotoGrid from "./gallery/PhotoGrid";
import PhotoList from "./gallery/PhotoList";

type Status = "loading" | "loaded" | "error";
type Layout = "grid" | "list";
type SortOrder = "desc" | "asc";

const DOWNLOAD_STAGGER_MS = 400;
// The most files albumo-backend puts in one ZIP; an album with more has to be downloaded a selection at a time.
const MAX_ZIP_FILES = 2000;
// How long "Download all" stays out of reach after it has started, so a second tap can't start a second ZIP.
const DOWNLOAD_ALL_COOLDOWN_MS = 8000;

function triggerDownload(id: string, name: string) {
  const a = document.createElement("a");
  a.href = `/api/photos/${id}/download`;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

type DownloadAll = "idle" | "checking" | "started";

export default function GalleryView({ allowDownloadAll = false }: { allowDownloadAll?: boolean }) {
  const [photos, setPhotos] = useState<PhotoFile[] | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [layout, setLayout] = useState<Layout>("grid");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [downloadingSelection, setDownloadingSelection] = useState(false);
  const [sharingPhotoId, setSharingPhotoId] = useState<string | null>(null);
  const [downloadAll, setDownloadAll] = useState<DownloadAll>("idle");
  const [downloadAllError, setDownloadAllError] = useState<string | null>(null);
  const downloadAllTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (downloadAllTimerRef.current) clearTimeout(downloadAllTimerRef.current);
    };
  }, []);

  const loadPhotos = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/photos");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { files: PhotoFile[] };
      setPhotos(data.files);
      setStatus("loaded");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const sortedPhotos = useMemo(() => {
    const list = photos ?? [];
    const copy = [...list];
    copy.sort((a, b) => {
      const diff = Date.parse(a.createdTime) - Date.parse(b.createdTime);
      return sortOrder === "asc" ? diff : -diff;
    });
    return copy;
  }, [photos, sortOrder]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleSingleDownload = useCallback((id: string, name: string) => {
    triggerDownload(id, name);
  }, []);

  const handleShare = useCallback(async (photo: PhotoFile) => {
    if (sharingPhotoId) return;
    setSharingPhotoId(photo.id);
    try {
      const blob = await generateStoryCard(`/api/photos/${photo.id}/thumbnail`);
      const baseName = photo.name.replace(/\.[^./]+$/, "");
      await shareOrDownloadCard(blob, `albumo-${baseName}.png`);
    } catch (err) {
      console.error(err);
    } finally {
      setSharingPhotoId(null);
    }
  }, [sharingPhotoId]);

  const handleDownloadSelected = useCallback(() => {
    if (selectedIds.size === 0 || downloadingSelection) return;
    const selected = sortedPhotos.filter((p) => selectedIds.has(p.id));
    setDownloadingSelection(true);
    selected.forEach((file, i) => {
      setTimeout(() => triggerDownload(file.id, file.name), i * DOWNLOAD_STAGGER_MS);
    });
    setTimeout(() => setDownloadingSelection(false), selected.length * DOWNLOAD_STAGGER_MS);
  }, [selectedIds, sortedPhotos, downloadingSelection]);

  // The ZIP is streamed by the server, so the browser starts saving it at once and keeps going; this only has to
  // start it. It asks first (`?check=1`) so that a refusal -- the host switched the button off meanwhile, or the
  // password changed -- is a message here instead of a saved error page.
  const handleDownloadAll = useCallback(async () => {
    if (downloadAll !== "idle") return;
    setDownloadAllError(null);
    setDownloadAll("checking");
    try {
      const res = await fetch("/api/download-all?check=1");
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setDownloadAllError(body?.error ?? "Couldn't start the download. Try again in a moment.");
        setDownloadAll("idle");
        return;
      }
    } catch {
      setDownloadAllError("Couldn't reach the server. Check your connection and try again.");
      setDownloadAll("idle");
      return;
    }

    const a = document.createElement("a");
    a.href = "/api/download-all";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setDownloadAll("started");
    downloadAllTimerRef.current = setTimeout(() => setDownloadAll("idle"), DOWNLOAD_ALL_COOLDOWN_MS);
  }, [downloadAll]);

  const openPreview = useCallback((index: number) => setPreviewIndex(index), []);
  const closePreview = useCallback(() => setPreviewIndex(null), []);
  const previewPrev = useCallback(() => {
    setPreviewIndex((i) => (i === null ? null : i === 0 ? sortedPhotos.length - 1 : i - 1));
  }, [sortedPhotos.length]);
  const previewNext = useCallback(() => {
    setPreviewIndex((i) => (i === null ? null : i === sortedPhotos.length - 1 ? 0 : i + 1));
  }, [sortedPhotos.length]);

  const previewPhoto = previewIndex !== null ? sortedPhotos[previewIndex] : null;
  // Offered when the host leaves it on and there is something to download, until the guest starts picking photos
  // (then the bar below is about their selection).
  const showDownloadAll = allowDownloadAll && status === "loaded" && sortedPhotos.length > 0 && selectedIds.size === 0;
  const tooManyForZip = sortedPhotos.length > MAX_ZIP_FILES;

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-2 text-sm font-medium text-foreground hover:bg-gray-100"
        >
          <ArrowLeft size={18} strokeWidth={1.75} />
          Back
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSortOrder((o) => (o === "desc" ? "asc" : "desc"))}
            className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-4 py-2 text-sm font-medium text-foreground hover:bg-gray-100"
          >
            <ArrowDownUp size={16} strokeWidth={1.75} />
            {sortOrder === "desc" ? "Newest first" : "Oldest first"}
          </button>

          <div className="flex rounded-full bg-gray-50 p-1">
            <button
              onClick={() => setLayout("grid")}
              aria-label="Grid layout"
              className={`group/tooltip relative rounded-full p-1.5 ${
                layout === "grid" ? "bg-indigo-600 text-on-accent" : "text-foreground"
              }`}
            >
              <LayoutGrid size={16} strokeWidth={1.75} />
              <TooltipLabel>Grid</TooltipLabel>
            </button>
            <button
              onClick={() => setLayout("list")}
              aria-label="List layout"
              className={`group/tooltip relative rounded-full p-1.5 ${
                layout === "list" ? "bg-indigo-600 text-on-accent" : "text-foreground"
              }`}
            >
              <List size={16} strokeWidth={1.75} />
              <TooltipLabel>List</TooltipLabel>
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {status === "loading" && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-600">Loading photos…</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-sm text-gray-600">Couldn&apos;t load photos.</p>
            <button
              onClick={loadPhotos}
              className="rounded-full bg-navy-900 px-5 py-2.5 text-sm font-medium text-ivory hover:bg-navy-900/90"
            >
              Try again
            </button>
          </div>
        )}

        {status === "loaded" && sortedPhotos.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-600">No photos yet</p>
          </div>
        )}

        {status === "loaded" &&
          sortedPhotos.length > 0 &&
          (layout === "grid" ? (
            <PhotoGrid
              photos={sortedPhotos}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
              onOpenPreview={openPreview}
              onDownload={handleSingleDownload}
            />
          ) : (
            <PhotoList
              photos={sortedPhotos}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
              onOpenPreview={openPreview}
              onDownload={handleSingleDownload}
            />
          ))}
      </div>

      {showDownloadAll && (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-gray-100 bg-background px-4 py-3">
          <span aria-live="polite" className={`min-w-0 flex-1 text-sm ${downloadAllError ? "font-medium text-red-600" : "text-gray-600"}`}>
            {downloadAllError ??
              (tooManyForZip
                ? "Too many to download at once. Select the ones you want."
                : downloadAll === "started"
                  ? "Your download is starting. A big album can take a minute to begin."
                  : `${sortedPhotos.length.toLocaleString()} ${sortedPhotos.length === 1 ? "photo" : "photos"}`)}
          </span>
          {!tooManyForZip && (
            <button
              onClick={handleDownloadAll}
              disabled={downloadAll !== "idle"}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-navy-900 px-5 py-2.5 text-sm font-medium text-ivory hover:bg-navy-900/90 disabled:opacity-50"
            >
              {downloadAll === "checking" ? (
                <Loader2 size={16} className="animate-spin" strokeWidth={1.75} />
              ) : (
                <Download size={16} strokeWidth={1.75} />
              )}
              {downloadAll === "checking" ? "Preparing…" : "Download all"}
            </button>
          )}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-gray-100 bg-background px-4 py-3">
          <span className="text-sm text-gray-600">{selectedIds.size} selected</span>
          <div className="flex items-center gap-3">
            <button
              onClick={clearSelection}
              className="text-sm text-gray-500 underline underline-offset-2"
            >
              Clear
            </button>
            <button
              onClick={handleDownloadSelected}
              disabled={downloadingSelection}
              className="inline-flex items-center gap-2 rounded-full bg-navy-900 px-5 py-2.5 text-sm font-medium text-ivory hover:bg-navy-900/90 disabled:opacity-50"
            >
              <Download size={16} strokeWidth={1.75} />
              Download selected ({selectedIds.size})
            </button>
          </div>
        </div>
      )}

      {previewPhoto && (
        <div
          className="fixed inset-0 z-[71] flex items-center justify-center bg-black/70 p-4"
          onClick={closePreview}
        >
          <div
            className="relative flex max-h-[90vh] max-w-4xl items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/photos/${previewPhoto.id}/thumbnail`}
              alt={previewPhoto.name}
              className="max-h-full max-w-full rounded-lg object-contain"
            />

            <button
              onClick={previewPrev}
              aria-label="Previous photo"
              className="group/tooltip absolute left-2 rounded-full bg-white/20 p-2 hover:bg-white/30 sm:left-4"
            >
              <ChevronLeft size={24} className="text-white" strokeWidth={1.75} />
              <TooltipLabel>Previous</TooltipLabel>
            </button>

            <button
              onClick={previewNext}
              aria-label="Next photo"
              className="group/tooltip absolute right-2 rounded-full bg-white/20 p-2 hover:bg-white/30 sm:right-4"
            >
              <ChevronRight size={24} className="text-white" strokeWidth={1.75} />
              <TooltipLabel>Next</TooltipLabel>
            </button>

            <div className="absolute right-2 top-2 flex items-center gap-2">
              <button
                onClick={() => handleShare(previewPhoto)}
                disabled={sharingPhotoId === previewPhoto.id}
                aria-label="Share photo"
                className="group/tooltip relative rounded-full bg-white/20 p-2 hover:bg-white/30 disabled:opacity-50"
              >
                {sharingPhotoId === previewPhoto.id ? (
                  <Loader2 size={20} className="animate-spin text-white" strokeWidth={1.75} />
                ) : (
                  <Share2 size={20} className="text-white" strokeWidth={1.75} />
                )}
                <TooltipLabel>Share</TooltipLabel>
              </button>

              <button
                onClick={() => handleSingleDownload(previewPhoto.id, previewPhoto.name)}
                aria-label="Download photo"
                className="group/tooltip relative rounded-full bg-white/20 p-2 hover:bg-white/30"
              >
                <Download size={20} className="text-white" strokeWidth={1.75} />
                <TooltipLabel>Download</TooltipLabel>
              </button>

              <button
                onClick={closePreview}
                aria-label="Close preview"
                className="group/tooltip relative rounded-full bg-white/20 p-2 hover:bg-white/30"
              >
                <X size={20} className="text-white" strokeWidth={1.75} />
                <TooltipLabel>Close</TooltipLabel>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
