"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera as CameraIcon,
  Image as ImageIcon,
  X,
  UploadCloud,
  RotateCcw,
  ArrowLeft,
} from "lucide-react";
import {
  PHOTO_LIMIT,
  getStoredCount,
  incrementStoredCount,
  getStoredPhotos,
  addStoredPhoto,
  createThumbnail,
} from "@/lib/photoStorage";
import PhotoGallery from "./PhotoGallery";
import { updatePhotoCountNotification } from "@/lib/notifications";

type FilterOption = {
  name: string;
  css: string;
};

const FILTERS: FilterOption[] = [
  { name: "Normal", css: "none" },
  { name: "Mono", css: "grayscale(1)" },
  { name: "Sepia", css: "sepia(0.8)" },
  { name: "Vivid", css: "saturate(1.6) contrast(1.15)" },
  { name: "Cool", css: "saturate(1.2) hue-rotate(15deg) brightness(1.05)" },
  { name: "Warm", css: "sepia(0.3) saturate(1.3) brightness(1.05)" },
];

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

type Stage = "idle" | "prompt" | "live" | "preview";
type Source = "camera" | "library" | null;
type SaveStatus = "idle" | "saving" | "success" | "error";

function buildFilename(ext: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `photo-${timestamp}.${ext}`;
}

export default function Camera() {
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [source, setSource] = useState<Source>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [filterIndex, setFilterIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewExt, setPreviewExt] = useState("jpg");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState<number | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  useEffect(() => {
    setPhotoCount(getStoredCount());
    setPhotos(getStoredPhotos());
  }, []);

  const remaining =
    photoCount === null ? PHOTO_LIMIT : Math.max(PHOTO_LIMIT - photoCount, 0);
  const limitReached = photoCount !== null && remaining <= 0;

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopStream, [stopStream]);

  const openLive = useCallback(async () => {
    setError(null);
    setPermissionDenied(false);
    setZoom(MIN_ZOOM);
    setFilterIndex(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          // "ideal" (not "exact") so the browser targets the camera's
          // maximum supported resolution instead of defaulting to a low
          // fallback (commonly 640x480) when no size is requested at all,
          // while still degrading gracefully on cameras that can't do 4K.
          width: { ideal: 4096 },
          height: { ideal: 2160 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setSource("camera");
      setStage("live");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setPermissionDenied(true);
        setError(
          "This needs permission to use your camera. Please allow camera access to continue."
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError("No camera was found on this device.");
      } else {
        setError(
          "Couldn't access the camera. Check that no other app is using it and try again."
        );
      }
    }
  }, []);

  // Entry point for "Take Photo": check whether we already hold camera
  // permission and route accordingly.
  //  - granted  → open the camera straight away.
  //  - denied   → tell the user to re-enable it in their browser settings.
  //  - prompt   → show a short priming screen before the native dialog.
  // iOS Safari can't query "camera" via the Permissions API, so on any
  // failure we fall back to calling getUserMedia directly — it proceeds
  // silently when already allowed and shows the native prompt otherwise.
  const handleTakePhoto = useCallback(async () => {
    setError(null);
    setPermissionDenied(false);
    let state: PermissionState | "unsupported" = "unsupported";
    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({
          name: "camera" as PermissionName,
        });
        state = status.state;
      }
    } catch {
      state = "unsupported";
    }

    if (state === "granted" || state === "unsupported") {
      openLive();
    } else if (state === "denied") {
      setPermissionDenied(true);
      setError(
        "Camera access is blocked for this site. Please enable the camera permission in your browser settings, then try again."
      );
    } else {
      setStage("prompt");
    }
  }, [openLive]);

  // The <video> element only exists in the DOM once `stage` becomes "live",
  // so the stream can only be attached after that render commits.
  useEffect(() => {
    if (stage === "live" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [stage]);

  const closeLive = useCallback(() => {
    stopStream();
    setStage("idle");
    setSource(null);
  }, [stopStream]);

  const openLibrary = useCallback(() => {
    libraryInputRef.current?.click();
  }, []);

  const handleLibraryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      e.target.value = "";
      if (!selected) return;
      const ext =
        (selected.name.includes(".") && selected.name.split(".").pop()) ||
        selected.type.split("/")[1] ||
        "jpg";
      setPreviewExt(ext);
      setPreviewBlob(selected);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(selected);
      });
      setSaveStatus("idle");
      setSaveError(null);
      setSource("library");
      setStage("preview");
    },
    []
  );

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    // Crop to the zoomed-in region so the saved photo matches the live preview.
    const sw = vw / zoom;
    const sh = vh / zoom;
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;

    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.filter = FILTERS[filterIndex].css;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, vw, vh);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stopStream();
        setPreviewExt("jpg");
        setPreviewBlob(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        setSaveStatus("idle");
        setSaveError(null);
        setStage("preview");
      },
      "image/jpeg",
      0.92
    );
  }, [zoom, filterIndex, stopStream]);

  const resetPreview = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewBlob(null);
    setSaveStatus("idle");
    setSaveError(null);
  }, []);

  const handleRetry = useCallback(() => {
    resetPreview();
    if (source === "camera") {
      openLive();
    } else {
      setStage("idle");
      setSource(null);
    }
  }, [source, openLive, resetPreview]);

  const handleDone = useCallback(() => {
    resetPreview();
    setStage("idle");
    setSource(null);
  }, [resetPreview]);

  const handleSave = useCallback(async () => {
    if (!previewBlob) return;
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const filename = buildFilename(previewExt);
      const formData = new FormData();
      formData.append("file", previewBlob, filename);
      formData.append("filename", filename);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(await res.text());
      setSaveStatus("success");
      const next = incrementStoredCount();
      setPhotoCount(next);
      updatePhotoCountNotification(Math.max(PHOTO_LIMIT - next, 0));
      if (previewUrl) {
        createThumbnail(previewUrl, 640, 0.72).then((thumb) => {
          setPhotos(addStoredPhoto(thumb));
        });
      }
    } catch {
      setSaveStatus("error");
      setSaveError("Couldn't save to Google Drive. Check your connection and try again.");
    }
  }, [previewBlob, previewExt, previewUrl]);

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background p-8 text-center text-foreground">
        <p className="max-w-sm">{error}</p>
        {permissionDenied ? (
          <>
            <button
              onClick={handleTakePhoto}
              className="inline-flex items-center gap-2 rounded-full bg-sage-700 px-6 py-3 font-medium text-ivory transition-colors hover:bg-sage-900"
            >
              <RotateCcw size={18} strokeWidth={1.75} />
              Try Again
            </button>
            <button
              onClick={() => {
                setError(null);
                setPermissionDenied(false);
              }}
              className="text-sm text-sage-600 underline underline-offset-2"
            >
              Or choose a photo instead
            </button>
          </>
        ) : (
          <button
            onClick={() => setError(null)}
            className="inline-flex items-center gap-2 rounded-full bg-sage-700 px-6 py-3 font-medium text-ivory transition-colors hover:bg-sage-900"
          >
            <ArrowLeft size={18} strokeWidth={1.75} />
            Back
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        onChange={handleLibraryChange}
        className="sr-only"
      />
      <canvas ref={canvasRef} className="hidden" />

      {photoCount !== null && (
        <div className="fixed bottom-4 left-4 z-[60] rounded-full bg-sage-900/80 px-3 py-1.5 text-xs font-medium text-ivory backdrop-blur">
          {remaining > 0 ? `${remaining} photos left` : "Limit reached"}
        </div>
      )}
      {photos[0] && (
        <button
          onClick={() => setIsGalleryOpen(true)}
          aria-label="View your photos"
          className="fixed bottom-4 right-4 z-[60] h-14 w-14 overflow-hidden rounded-lg border-2 border-ivory/80 shadow-lg"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[0]}
            alt="Last saved photo"
            className="h-full w-full object-cover"
          />
        </button>
      )}
      {isGalleryOpen && (
        <PhotoGallery photos={photos} onClose={() => setIsGalleryOpen(false)} />
      )}

      {stage === "idle" &&
        (limitReached ? (
          <div className="max-w-sm rounded-2xl bg-sage-100 px-6 py-5 text-center text-sage-900">
            <p className="font-medium">You&apos;ve shared 20 photos — thank you!</p>
            <p className="mt-1 text-sm text-sage-700">
              That&apos;s the limit per device for tonight. Ask a friend to
              snap the next one!
            </p>
          </div>
        ) : (
          <div className="flex gap-4">
            <button
              onClick={handleTakePhoto}
              className="inline-flex items-center gap-2 rounded-full bg-sage-700 px-6 py-4 text-lg font-medium text-ivory transition-colors hover:bg-sage-900"
            >
              <CameraIcon size={18} strokeWidth={1.75} />
              Take Photo
            </button>
            <button
              onClick={openLibrary}
              className="inline-flex items-center gap-2 rounded-full bg-sage-100 px-6 py-4 text-lg font-medium text-sage-900 transition-colors hover:bg-sage-100/70"
            >
              <ImageIcon size={18} strokeWidth={1.75} />
              Choose Photo
            </button>
          </div>
        ))}

      {stage === "prompt" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background p-8 text-center text-foreground">
          <p className="max-w-sm text-lg">
            Wedding Photos needs access to your camera to take a photo.
          </p>
          <p className="max-w-sm text-sm text-sage-600">
            Tap Allow below, then choose Allow when your browser asks for
            permission.
          </p>
          <button
            onClick={openLive}
            className="inline-flex items-center gap-2 rounded-full bg-sage-700 px-8 py-3 font-medium text-ivory transition-colors hover:bg-sage-900"
          >
            <CameraIcon size={18} strokeWidth={1.75} />
            Allow Camera
          </button>
          <button
            onClick={() => setStage("idle")}
            className="inline-flex items-center gap-1 text-sm text-sage-600 underline underline-offset-2"
          >
            <X size={14} strokeWidth={1.75} />
            Cancel
          </button>
        </div>
      )}

      {stage === "live" && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-camera-bg">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              filter: FILTERS[filterIndex].css,
              transform: `scale(${zoom})`,
            }}
            className="h-full w-full object-cover"
          />

          <button
            onClick={closeLive}
            className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-camera-bg/60 px-4 py-2 text-sm text-ivory backdrop-blur"
          >
            <X size={16} strokeWidth={1.75} />
            Cancel
          </button>

          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 pb-8">
            <div className="flex max-w-full gap-2 overflow-x-auto px-4">
              {FILTERS.map((f, i) => (
                <button
                  key={f.name}
                  onClick={() => setFilterIndex(i)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors ${
                    i === filterIndex
                      ? "bg-sage-500 text-ivory"
                      : "bg-ivory/15 text-ivory backdrop-blur hover:bg-ivory/25"
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>

            <div className="flex w-64 items-center gap-3 text-ivory">
              <span className="text-sm">{MIN_ZOOM}x</span>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1 accent-sage-300"
              />
              <span className="text-sm">{MAX_ZOOM}x</span>
            </div>

            <button
              onClick={handleCapture}
              aria-label="Take photo"
              className="h-16 w-16 rounded-full border-4 border-ivory bg-ivory/30 transition-colors hover:bg-ivory/50"
            />
          </div>
        </div>
      )}

      {stage === "preview" && previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-camera-bg p-6">
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Captured photo"
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          </div>
          {saveStatus === "success" ? (
            <div className="flex flex-col items-center gap-4 pb-4">
              <p className="text-ivory">Saved to Google Drive!</p>
              <button
                onClick={handleDone}
                className="inline-flex items-center gap-2 rounded-full bg-sage-700 px-6 py-3 font-medium text-ivory transition-colors hover:bg-sage-900"
              >
                <CameraIcon size={18} strokeWidth={1.75} />
                Take Another
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 pb-4">
              {saveStatus === "error" && saveError && (
                <p className="max-w-sm text-center text-sm text-red-400">
                  {saveError}
                </p>
              )}
              <div className="flex gap-4">
                <button
                  onClick={handleRetry}
                  disabled={saveStatus === "saving"}
                  className="inline-flex items-center gap-2 rounded-full bg-ivory/15 px-6 py-3 text-ivory backdrop-blur transition-colors hover:bg-ivory/25 disabled:opacity-50"
                >
                  <RotateCcw size={18} strokeWidth={1.75} />
                  Try again
                </button>
                <button
                  onClick={handleSave}
                  disabled={saveStatus === "saving"}
                  className="inline-flex items-center gap-2 rounded-full bg-sage-700 px-6 py-3 font-medium text-ivory transition-colors hover:bg-sage-900 disabled:opacity-50"
                >
                  {saveStatus === "saving" ? (
                    "Saving..."
                  ) : saveStatus === "error" ? (
                    <>
                      <RotateCcw size={18} strokeWidth={1.75} />
                      Retry Save
                    </>
                  ) : (
                    <>
                      <UploadCloud size={18} strokeWidth={1.75} />
                      Save
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
