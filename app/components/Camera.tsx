"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera as CameraIcon,
  Image as ImageIcon,
  X,
  UploadCloud,
  RotateCcw,
  ArrowLeft,
  SwitchCamera,
  Zap,
  ZapOff,
  Images,
  Check,
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

type FacingMode = "environment" | "user";
type TimerOption = 0 | 3 | 10;

const TIMER_OPTIONS: TimerOption[] = [0, 3, 10];

type PreviewItem = {
  url: string;
  blob: Blob;
  ext: string;
  selected: boolean;
};

const BURST_COUNT = 5;
const BURST_INTERVAL_MS = 250;
const FLASH_DURATION_MS = 200;

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
  const cancelledRef = useRef(false);
  const countdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [source, setSource] = useState<Source>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [filterIndex, setFilterIndex] = useState(0);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [flashOn, setFlashOn] = useState(false);
  const [hdrOn, setHdrOn] = useState(false);
  const [burstOn, setBurstOn] = useState(false);
  const [timerOption, setTimerOption] = useState<TimerOption>(0);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
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

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (countdownTimeoutRef.current) clearTimeout(countdownTimeoutRef.current);
      if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  const openLive = useCallback(
    async (mode: FacingMode = facingMode, opts?: { resetSettings?: boolean }) => {
      cancelledRef.current = false;
      setError(null);
      setPermissionDenied(false);
      if (opts?.resetSettings) {
        setZoom(MIN_ZOOM);
        setFilterIndex(0);
        setFlashOn(false);
        setHdrOn(false);
        setBurstOn(false);
        setTimerOption(0);
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: mode,
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
        setFacingMode(mode);
        setSource("camera");
        setStage("live");
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
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
    },
    [facingMode]
  );

  const switchCamera = useCallback(() => {
    const next: FacingMode = facingMode === "environment" ? "user" : "environment";
    stopStream();
    openLive(next);
  }, [facingMode, stopStream, openLive]);

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
      openLive("environment", { resetSettings: true });
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
    cancelledRef.current = true;
    if (countdownTimeoutRef.current) clearTimeout(countdownTimeoutRef.current);
    if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    setCountdownValue(null);
    setIsCapturing(false);
    setFlashActive(false);
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
      const url = URL.createObjectURL(selected);
      setPreviewItems([{ url, blob: selected, ext, selected: true }]);
      setSaveStatus("idle");
      setSaveError(null);
      setSource("library");
      setStage("preview");
    },
    []
  );

  const captureFrame = useCallback((): Promise<PreviewItem | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return resolve(null);
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return resolve(null);

      const sw = vw / zoom;
      const sh = vh / zoom;
      const sx = (vw - sw) / 2;
      const sy = (vh - sh) / 2;

      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);

      const baseFilter = FILTERS[filterIndex].css;
      const hdrFilter = "contrast(1.15) saturate(1.25) brightness(1.05)";
      ctx.filter =
        baseFilter === "none"
          ? hdrOn
            ? hdrFilter
            : "none"
          : hdrOn
          ? `${baseFilter} ${hdrFilter}`
          : baseFilter;

      ctx.save();
      if (facingMode === "user") {
        ctx.translate(vw, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, vw, vh);
      ctx.restore();

      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(null);
          const ext = "jpg";
          const url = URL.createObjectURL(blob);
          resolve({ url, blob, ext, selected: true });
        },
        "image/jpeg",
        0.92
      );
    });
  }, [zoom, filterIndex, hdrOn, facingMode]);

  const fireFlash = useCallback(() => {
    if (!flashOn) return;
    setFlashActive(true);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => {
      if (!cancelledRef.current) setFlashActive(false);
    }, FLASH_DURATION_MS);
  }, [flashOn]);

  const runSingleCapture = useCallback(async () => {
    fireFlash();
    const item = await captureFrame();
    if (cancelledRef.current || !item) return;
    stopStream();
    setPreviewItems([item]);
    setSaveStatus("idle");
    setSaveError(null);
    setStage("preview");
  }, [fireFlash, captureFrame, stopStream]);

  const runBurstCapture = useCallback(async () => {
    setIsCapturing(true);
    const items: PreviewItem[] = [];
    for (let i = 0; i < BURST_COUNT; i++) {
      if (cancelledRef.current) {
        setIsCapturing(false);
        return;
      }
      fireFlash();
      const item = await captureFrame();
      if (cancelledRef.current) {
        setIsCapturing(false);
        return;
      }
      if (item) items.push(item);
      if (i < BURST_COUNT - 1) {
        await new Promise<void>((resolve) => {
          burstTimeoutRef.current = setTimeout(resolve, BURST_INTERVAL_MS);
        });
      }
    }
    if (cancelledRef.current) return;
    setIsCapturing(false);
    stopStream();
    setPreviewItems(items);
    setSaveStatus("idle");
    setSaveError(null);
    setStage("preview");
  }, [fireFlash, captureFrame, stopStream]);

  const cancelCountdown = useCallback(() => {
    if (countdownTimeoutRef.current) clearTimeout(countdownTimeoutRef.current);
    setCountdownValue(null);
  }, []);

  const runCountdownThenCapture = useCallback(
    (seconds: number, after: () => void) => {
      setCountdownValue(seconds);
      const tick = (remaining: number) => {
        if (cancelledRef.current) return;
        if (remaining <= 0) {
          setCountdownValue(null);
          after();
          return;
        }
        countdownTimeoutRef.current = setTimeout(() => {
          setCountdownValue(remaining - 1);
          tick(remaining - 1);
        }, 1000);
      };
      countdownTimeoutRef.current = setTimeout(() => {
        setCountdownValue((remaining) => (remaining ?? seconds) - 1);
        tick(seconds - 1);
      }, 1000);
    },
    []
  );

  const handleCaptureButton = useCallback(() => {
    if (isCapturing) return;
    if (countdownValue !== null) {
      cancelCountdown();
      return;
    }
    const run = burstOn ? runBurstCapture : runSingleCapture;
    if (timerOption > 0) {
      runCountdownThenCapture(timerOption, run);
    } else {
      run();
    }
  }, [
    isCapturing,
    countdownValue,
    burstOn,
    timerOption,
    cancelCountdown,
    runCountdownThenCapture,
    runBurstCapture,
    runSingleCapture,
  ]);

  const resetPreview = useCallback(() => {
    setPreviewItems((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.url));
      return [];
    });
    setSaveStatus("idle");
    setSaveError(null);
  }, []);

  const toggleItemSelected = useCallback((index: number) => {
    setPreviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, selected: !item.selected } : item
      )
    );
  }, []);

  const handleRetry = useCallback(() => {
    resetPreview();
    if (source === "camera") {
      openLive("environment", { resetSettings: true });
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

  const handlePromptScreenCaptureClick = useCallback(() => {
    openLive("environment", { resetSettings: true });
  }, [openLive]);

  const handleSave = useCallback(async () => {
    const toSave = previewItems.filter((item) => item.selected);
    if (toSave.length === 0) return;

    setSaveStatus("saving");
    setSaveError(null);

    const currentRemaining =
      photoCount === null ? PHOTO_LIMIT : Math.max(PHOTO_LIMIT - photoCount, 0);
    const capped = toSave.slice(0, currentRemaining);
    const skippedForLimit = toSave.length - capped.length;

    try {
      let runningCount = photoCount ?? 0;
      for (const item of capped) {
        const filename = buildFilename(item.ext);
        const formData = new FormData();
        formData.append("file", item.blob, filename);
        formData.append("filename", filename);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error(await res.text());

        runningCount = incrementStoredCount();
        const thumb = await createThumbnail(item.url, 640, 0.72);
        setPhotos(addStoredPhoto(thumb));
      }
      setPhotoCount(runningCount);
      updatePhotoCountNotification(Math.max(PHOTO_LIMIT - runningCount, 0));
      setSaveStatus("success");
      if (skippedForLimit > 0) {
        setSaveError(
          `Saved as many as your remaining limit allowed; ${skippedForLimit} photo(s) were not saved.`
        );
      }
    } catch {
      setSaveStatus("error");
      setSaveError("Couldn't save to Google Drive. Check your connection and try again.");
    }
  }, [previewItems, photoCount]);

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
              <CameraIcon size={35} strokeWidth={1.75} />
              Take Photo
            </button>
            <button
              onClick={openLibrary}
              className="inline-flex items-center gap-2 rounded-full bg-sage-100 px-6 py-4 text-lg font-medium text-sage-900 transition-colors hover:bg-sage-100/70"
            >
              <ImageIcon size={35} strokeWidth={1.75} />
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
            onClick={handlePromptScreenCaptureClick}
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
              transform: `scale(${zoom})${facingMode === "user" ? " scaleX(-1)" : ""}`,
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

          <div
            className={`absolute right-4 top-4 flex items-center gap-2 ${
              isCapturing || countdownValue !== null ? "pointer-events-none opacity-40" : ""
            }`}
          >
            <button
              onClick={switchCamera}
              aria-label="Switch camera"
              disabled={isCapturing || countdownValue !== null}
              className="h-10 w-10 rounded-full bg-camera-bg/60 text-ivory backdrop-blur flex items-center justify-center transition-colors hover:bg-camera-bg/80 disabled:opacity-50"
            >
              <SwitchCamera size={18} strokeWidth={1.75} />
            </button>
            <button
              onClick={() => setFlashOn((v) => !v)}
              aria-label="Toggle flash"
              disabled={isCapturing || countdownValue !== null}
              className={`h-10 w-10 rounded-full backdrop-blur flex items-center justify-center transition-colors disabled:opacity-50 ${
                flashOn ? "bg-sage-500 text-ivory" : "bg-camera-bg/60 text-ivory hover:bg-camera-bg/80"
              }`}
            >
              {flashOn ? (
                <Zap size={18} strokeWidth={1.75} />
              ) : (
                <ZapOff size={18} strokeWidth={1.75} />
              )}
            </button>
            <button
              onClick={() => setHdrOn((v) => !v)}
              aria-label="Toggle HDR"
              disabled={isCapturing || countdownValue !== null}
              className={`h-10 rounded-full px-3 text-xs font-medium backdrop-blur flex items-center justify-center transition-colors disabled:opacity-50 ${
                hdrOn ? "bg-sage-500 text-ivory" : "bg-camera-bg/60 text-ivory hover:bg-camera-bg/80"
              }`}
            >
              HDR
            </button>
            <button
              onClick={() => setBurstOn((v) => !v)}
              aria-label="Toggle burst mode"
              disabled={isCapturing || countdownValue !== null}
              className={`h-10 w-10 rounded-full backdrop-blur flex items-center justify-center transition-colors disabled:opacity-50 ${
                burstOn ? "bg-sage-500 text-ivory" : "bg-camera-bg/60 text-ivory hover:bg-camera-bg/80"
              }`}
            >
              <Images size={18} strokeWidth={1.75} />
            </button>
          </div>

          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 pb-8">
            <div className="flex max-w-full gap-2 overflow-x-auto px-4">
              {FILTERS.map((f, i) => (
                <button
                  key={f.name}
                  onClick={() => setFilterIndex(i)}
                  disabled={isCapturing || countdownValue !== null}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                    i === filterIndex
                      ? "bg-sage-500 text-ivory"
                      : "bg-ivory/15 text-ivory backdrop-blur hover:bg-ivory/25"
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>

            <div className="flex gap-2 overflow-x-auto px-4">
              {TIMER_OPTIONS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTimerOption(t)}
                  disabled={isCapturing}
                  className={`rounded-full px-4 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                    t === timerOption
                      ? "bg-sage-500 text-ivory"
                      : "bg-ivory/15 text-ivory backdrop-blur hover:bg-ivory/25"
                  }`}
                >
                  {t === 0 ? "Off" : `${t}s`}
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
                disabled={isCapturing || countdownValue !== null}
                className="flex-1 accent-sage-300 disabled:opacity-50"
              />
              <span className="text-sm">{MAX_ZOOM}x</span>
            </div>

            <button
              onClick={handleCaptureButton}
              aria-label={burstOn ? "Take burst photos" : "Take photo"}
              disabled={isCapturing}
              className={`h-16 w-16 rounded-full border-4 transition-colors disabled:opacity-60 ${
                burstOn ? "border-sage-300" : "border-ivory"
              } bg-ivory/30 hover:bg-ivory/50 disabled:hover:bg-ivory/30`}
            />
          </div>

          {countdownValue !== null && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
              <span className="text-8xl font-bold text-ivory">{countdownValue}</span>
            </div>
          )}

          <div
            aria-hidden
            className={`pointer-events-none absolute inset-0 z-20 bg-white transition-opacity duration-150 ${
              flashActive ? "opacity-90" : "opacity-0"
            }`}
          />
        </div>
      )}

      {stage === "preview" && previewItems.length > 0 && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-camera-bg p-6">
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            {previewItems.length === 1 ? (
              <img
                src={previewItems[0].url}
                alt="Captured photo"
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            ) : (
              <div className="grid w-full max-w-md grid-cols-3 gap-2 overflow-y-auto">
                {previewItems.map((item, i) => (
                  <button
                    key={item.url}
                    onClick={() => toggleItemSelected(i)}
                    className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-opacity ${
                      item.selected ? "border-sage-500" : "border-transparent opacity-50"
                    }`}
                  >
                    <img
                      src={item.url}
                      alt={`Burst photo ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <span
                      className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full ${
                        item.selected ? "bg-sage-500" : "bg-black/40"
                      }`}
                    >
                      {item.selected && (
                        <Check size={12} strokeWidth={2.5} className="text-ivory" />
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {saveStatus === "success" ? (
            <div className="flex flex-col items-center gap-4 pb-4">
              <p className="text-ivory">
                {previewItems.length > 1
                  ? `Saved ${previewItems.filter((p) => p.selected).length} photos to Google Drive!`
                  : "Saved to Google Drive!"}
              </p>
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
                      {previewItems.length > 1 &&
                        ` (${previewItems.filter((p) => p.selected).length})`}
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
