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
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Trash2,
  Download,
} from "lucide-react";
import {
  getStoredCount,
  incrementStoredCount,
  decrementStoredCount,
  createThumbnail,
  getMyPhotos,
  addMyPhoto,
  removeMyPhoto,
  type MyPhoto,
} from "@/lib/photoStorage";
import { getStoredGuestName } from "@/lib/guestName";
import { updatePhotoCountNotification } from "@/lib/notifications";
import { getOrCreateUploaderToken } from "@/lib/uploaderToken";
import { todayInManila } from "@/lib/manilaDate";

// Filters are stored as structured ops rather than CSS strings so the live
// preview (CSS on the <video>) and the captured photo (a colour matrix applied
// to the canvas pixels) are always derived from the same source and can't drift.
type FilterOp =
  | {
      fn: "grayscale" | "sepia" | "saturate" | "brightness" | "contrast";
      value: number;
    }
  | { fn: "hue-rotate"; deg: number };

type FilterOption = {
  name: string;
  ops: FilterOp[];
};

const FILTERS: FilterOption[] = [
  { name: "Normal", ops: [] },
  { name: "Mono", ops: [{ fn: "grayscale", value: 1 }] },
  { name: "Sepia", ops: [{ fn: "sepia", value: 0.8 }] },
  {
    name: "Vivid",
    ops: [
      { fn: "saturate", value: 1.6 },
      { fn: "contrast", value: 1.15 },
    ],
  },
  {
    name: "Cool",
    ops: [
      { fn: "saturate", value: 1.2 },
      { fn: "hue-rotate", deg: 15 },
      { fn: "brightness", value: 1.05 },
    ],
  },
  {
    name: "Warm",
    ops: [
      { fn: "sepia", value: 0.3 },
      { fn: "saturate", value: 1.3 },
      { fn: "brightness", value: 1.05 },
    ],
  },
];

const HDR_OPS: FilterOp[] = [
  { fn: "contrast", value: 1.15 },
  { fn: "saturate", value: 1.25 },
  { fn: "brightness", value: 1.05 },
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
// Give auto-exposure a moment to react to the torch before capturing, otherwise
// the shot is taken before the light actually registers.
const TORCH_WARMUP_MS = 350;

// `torch` isn't in lib.dom's media types yet.
type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraintSet = MediaTrackConstraintSet & { torch?: boolean };

function composeFilterOps(filterIndex: number, hdrOn: boolean): FilterOp[] {
  const base = FILTERS[filterIndex].ops;
  return hdrOn ? [...base, ...HDR_OPS] : base;
}

function opsToCss(ops: FilterOp[]) {
  if (ops.length === 0) return "none";
  return ops
    .map((op) =>
      op.fn === "hue-rotate" ? `hue-rotate(${op.deg}deg)` : `${op.fn}(${op.value})`
    )
    .join(" ");
}

// Colour matrices per the Filter Effects spec. Each op becomes a 3x3 RGB matrix
// plus a per-channel offset (kept in 0-1 units); alpha is never touched.
type ColorMatrix = { m: number[]; o: number[] };

const IDENTITY_MATRIX: ColorMatrix = {
  m: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  o: [0, 0, 0],
};

function saturateMatrix(s: number): ColorMatrix {
  return {
    m: [
      0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
      0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
      0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
    ],
    o: [0, 0, 0],
  };
}

function sepiaMatrix(a: number): ColorMatrix {
  const i = 1 - a;
  return {
    m: [
      0.393 + 0.607 * i, 0.769 - 0.769 * i, 0.189 - 0.189 * i,
      0.349 - 0.349 * i, 0.686 + 0.314 * i, 0.168 - 0.168 * i,
      0.272 - 0.272 * i, 0.534 - 0.534 * i, 0.131 + 0.869 * i,
    ],
    o: [0, 0, 0],
  };
}

function hueRotateMatrix(deg: number): ColorMatrix {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    m: [
      0.213 + c * 0.787 - s * 0.213,
      0.715 - c * 0.715 - s * 0.715,
      0.072 - c * 0.072 + s * 0.928,
      0.213 - c * 0.213 + s * 0.143,
      0.715 + c * 0.285 + s * 0.14,
      0.072 - c * 0.072 - s * 0.283,
      0.213 - c * 0.213 - s * 0.787,
      0.715 - c * 0.715 + s * 0.715,
      0.072 + c * 0.928 + s * 0.072,
    ],
    o: [0, 0, 0],
  };
}

function opToMatrix(op: FilterOp): ColorMatrix {
  switch (op.fn) {
    // grayscale(a) is defined as saturate(1 - a).
    case "grayscale":
      return saturateMatrix(1 - op.value);
    case "sepia":
      return sepiaMatrix(op.value);
    case "saturate":
      return saturateMatrix(op.value);
    case "hue-rotate":
      return hueRotateMatrix(op.deg);
    case "brightness":
      return {
        m: [op.value, 0, 0, 0, op.value, 0, 0, 0, op.value],
        o: [0, 0, 0],
      };
    case "contrast": {
      const offset = (1 - op.value) / 2;
      return {
        m: [op.value, 0, 0, 0, op.value, 0, 0, 0, op.value],
        o: [offset, offset, offset],
      };
    }
  }
}

// Folds ops into one matrix by applying each on top of the previous:
// M = M_next · M_prev, O = M_next · O_prev + O_next.
function opsToMatrix(ops: FilterOp[]): ColorMatrix {
  return ops.reduce<ColorMatrix>((prev, op) => {
    const { m: n, o: no } = opToMatrix(op);
    const m = new Array<number>(9);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        m[row * 3 + col] =
          n[row * 3] * prev.m[col] +
          n[row * 3 + 1] * prev.m[3 + col] +
          n[row * 3 + 2] * prev.m[6 + col];
      }
    }
    const o = new Array<number>(3);
    for (let row = 0; row < 3; row++) {
      o[row] =
        n[row * 3] * prev.o[0] +
        n[row * 3 + 1] * prev.o[1] +
        n[row * 3 + 2] * prev.o[2] +
        no[row];
    }
    return { m, o };
  }, IDENTITY_MATRIX);
}

// Applied in place. Uint8ClampedArray clamps for us, so no manual bounds checks.
function applyFilterOps(imageData: ImageData, ops: FilterOp[]) {
  if (ops.length === 0) return;
  const { m, o } = opsToMatrix(ops);
  const or = o[0] * 255;
  const og = o[1] * 255;
  const ob = o[2] * 255;
  const px = imageData.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    px[i] = m[0] * r + m[1] * g + m[2] * b + or;
    px[i + 1] = m[3] * r + m[4] * g + m[5] * b + og;
    px[i + 2] = m[6] * r + m[7] * g + m[8] * b + ob;
  }
}

type Stage = "idle" | "prompt" | "live" | "preview";
type Source = "camera" | "library" | null;

type UploadJob = {
  id: number;
  blob: Blob;
  filename: string;
  thumbnail: string;
  uploaderName?: string;
  status: "pending" | "uploading" | "error";
};

function buildFilename(ext: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `photo-${timestamp}.${ext}`;
}

type Props = {
  eventName: string;
  photoLimit: number;
  /** Whether today is the event's own day -- taking or uploading a photo is only allowed then. */
  canUpload: boolean;
  /** The event's date, "YYYY-MM-DD", shown in the closed message when `canUpload` is false. */
  eventDate: string;
};

/** "YYYY-MM-DD" as e.g. "December 25, 2026", without any UTC/local shift. */
function formatEventDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function Camera({ eventName, photoLimit, canUpload, eventDate }: Props) {
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);
  const countdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashHoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const torchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [torchSupported, setTorchSupported] = useState(false);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [photoCount, setPhotoCount] = useState<number | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadJob[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [myPhotos, setMyPhotos] = useState<MyPhoto[]>([]);
  const [myPhotosOpen, setMyPhotosOpen] = useState(false);
  const [myPhotoPreviewIndex, setMyPhotoPreviewIndex] = useState<number | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const uploaderTokenRef = useRef<string | null>(null);
  const nextJobIdRef = useRef(0);
  // Source of truth for the queue; `uploadQueue` state is just a mirror of
  // this kept in sync via syncQueue() so the UI re-renders reactively.
  // Processing is triggered directly by enqueue/retry calls (not an effect
  // watching state) so a job's own completion can kick off the next one
  // without bouncing through a render.
  const queueRef = useRef<UploadJob[]>([]);
  const isProcessingRef = useRef(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPhotoCount(getStoredCount());
    setMyPhotos(getMyPhotos());
    uploaderTokenRef.current = getOrCreateUploaderToken();
  }, []);

  const showToast = useCallback((message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(message);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const syncQueue = useCallback(() => {
    setUploadQueue([...queueRef.current]);
  }, []);

  // Uploads run one at a time in the background so a slow connection never
  // blocks the guest from taking the next photo.
  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    try {
      let job: UploadJob | undefined;
      while ((job = queueRef.current.find((j) => j.status === "pending"))) {
        job.status = "uploading";
        syncQueue();
        try {
          const formData = new FormData();
          formData.append("file", job.blob, job.filename);
          formData.append("filename", job.filename);
          if (job.uploaderName) formData.append("uploaderName", job.uploaderName);
          if (uploaderTokenRef.current) formData.append("uploaderToken", uploaderTokenRef.current);
          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });
          if (res.status === 409) {
            // Permanently blocked for this event (its guest limit has been
            // reached) -- never retryable, unlike every other failure below,
            // so the job is dropped outright instead of left as a retryable
            // "error", and the limit slot it had optimistically reserved is
            // freed, the same as giving up on a failed upload does below.
            queueRef.current = queueRef.current.filter((j) => j !== job);
            syncQueue();
            setPhotoCount(decrementStoredCount());
            showToast("This event has reached its guest limit. New photos can't be added from this device.");
            continue;
          }
          if (!res.ok) throw new Error(await res.text());
          const data = (await res.json()) as { fileId: string };
          queueRef.current = queueRef.current.filter((j) => j !== job);
          syncQueue();
          setMyPhotos(addMyPhoto(data.fileId, job.thumbnail));
        } catch {
          job.status = "error";
          syncQueue();
          showToast("Couldn't share a photo. Check your connection and retry.");
        }
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [syncQueue, showToast]);

  const enqueueUpload = useCallback(
    (blob: Blob, filename: string, thumbnail: string, uploaderName?: string) => {
      queueRef.current = [
        ...queueRef.current,
        { id: nextJobIdRef.current++, blob, filename, thumbnail, uploaderName, status: "pending" },
      ];
      syncQueue();
      processQueue();
    },
    [syncQueue, processQueue]
  );

  const retryFailedUploads = useCallback(() => {
    queueRef.current = queueRef.current.map((j) =>
      j.status === "error" ? { ...j, status: "pending" } : j
    );
    syncQueue();
    processQueue();
  }, [syncQueue, processQueue]);

  // Giving up on a failed upload frees the limit slot it had reserved.
  const dismissFailedUploads = useCallback(() => {
    const dropped = queueRef.current.filter((j) => j.status === "error").length;
    queueRef.current = queueRef.current.filter((j) => j.status !== "error");
    syncQueue();
    if (dropped > 0) {
      let next = photoCount ?? getStoredCount();
      for (let i = 0; i < dropped; i++) next = decrementStoredCount();
      setPhotoCount(next);
    }
  }, [photoCount, syncQueue]);

  // Deleting a shared photo frees the limit slot it was taking up, same as
  // giving up on a failed upload above. Returns whether it actually succeeded,
  // so callers like the full-screen preview know whether it's safe to move on.
  const handleDeletePhoto = useCallback(
    async (photo: MyPhoto): Promise<boolean> => {
      setDeletingIds((prev) => new Set(prev).add(photo.id));
      try {
        const res = await fetch(`/api/photos/${encodeURIComponent(photo.id)}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploaderToken: uploaderTokenRef.current }),
        });
        if (!res.ok) throw new Error(await res.text());
        setMyPhotos(removeMyPhoto(photo.id));
        const next = decrementStoredCount();
        setPhotoCount(next);
        updatePhotoCountNotification(Math.max(photoLimit - next, 0), eventName);
        return true;
      } catch {
        showToast("Couldn't delete that photo. Check your connection and try again.");
        return false;
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(photo.id);
          return next;
        });
      }
    },
    [photoLimit, eventName, showToast]
  );

  const closeMyPhotos = useCallback(() => {
    setMyPhotosOpen(false);
    setMyPhotoPreviewIndex(null);
  }, []);

  const myPhotoPreviewPrev = useCallback(() => {
    setMyPhotoPreviewIndex((i) =>
      i === null ? null : i === 0 ? myPhotos.length - 1 : i - 1
    );
  }, [myPhotos.length]);

  const myPhotoPreviewNext = useCallback(() => {
    setMyPhotoPreviewIndex((i) =>
      i === null ? null : i === myPhotos.length - 1 ? 0 : i + 1
    );
  }, [myPhotos.length]);

  const handleDownloadMyPhoto = useCallback((photo: MyPhoto) => {
    const a = document.createElement("a");
    a.href = `/api/photos/${encodeURIComponent(photo.id)}/download`;
    a.download = photo.id;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  // On success, closes the full-screen preview back to the grid rather than
  // trying to show a next photo at a now-shifted index. On failure, stays
  // open so the guest can see the error toast and retry.
  const handleDeleteFromMyPhotoPreview = useCallback(
    async (photo: MyPhoto) => {
      if (await handleDeletePhoto(photo)) {
        setMyPhotoPreviewIndex(null);
      }
    },
    [handleDeletePhoto]
  );

  const remaining =
    photoCount === null ? photoLimit : Math.max(photoLimit - photoCount, 0);
  const limitReached = photoCount !== null && remaining <= 0;

  // Only meaningful when !canUpload: whether the event's day hasn't arrived
  // yet, or has already passed, so the closed message below can say which.
  const eventHasPassed = !canUpload && eventDate < todayInManila();

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Best-effort: silently no-ops on devices without a torch.
  const setTorch = useCallback(async (on: boolean) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return false;
    try {
      await track.applyConstraints({
        advanced: [{ torch: on } as TorchConstraintSet],
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => stopStream, [stopStream]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (countdownTimeoutRef.current) clearTimeout(countdownTimeoutRef.current);
      if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      if (flashHoldTimeoutRef.current) clearTimeout(flashHoldTimeoutRef.current);
      if (torchTimeoutRef.current) clearTimeout(torchTimeoutRef.current);
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
        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as TorchCapabilities | undefined;
        setTorchSupported(Boolean(caps?.torch));
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

  const switchCamera = useCallback(async () => {
    const next: FacingMode = facingMode === "environment" ? "user" : "environment";
    await setTorch(false);
    stopStream();
    openLive(next);
  }, [facingMode, setTorch, stopStream, openLive]);

  // Entry point for "Take Photo": check whether we already hold camera
  // permission and route accordingly.
  //  - granted  → open the camera straight away.
  //  - denied   → tell the user to re-enable it in their browser settings.
  //  - prompt   → show a short priming screen before the native dialog.
  // iOS Safari can't query "camera" via the Permissions API, so on any
  // failure we fall back to calling getUserMedia directly — it proceeds
  // silently when already allowed and shows the native prompt otherwise.
  const handleTakePhoto = useCallback(async () => {
    if (!canUpload) return;
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
  }, [canUpload, openLive]);

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
    if (flashHoldTimeoutRef.current) clearTimeout(flashHoldTimeoutRef.current);
    if (torchTimeoutRef.current) clearTimeout(torchTimeoutRef.current);
    setCountdownValue(null);
    setIsCapturing(false);
    setFlashActive(false);
    // Best-effort torch-off; stopping the track extinguishes it regardless, so
    // don't gate teardown on the constraint call resolving.
    void setTorch(false);
    stopStream();
    setStage("idle");
    setSource(null);
  }, [stopStream, setTorch]);

  const openLibrary = useCallback(() => {
    if (!canUpload) return;
    libraryInputRef.current?.click();
  }, [canUpload]);

  const handleLibraryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      e.target.value = "";
      if (!selected || !canUpload) return;
      const ext =
        (selected.name.includes(".") && selected.name.split(".").pop()) ||
        selected.type.split("/")[1] ||
        "jpg";
      const url = URL.createObjectURL(selected);
      setPreviewItems([{ url, blob: selected, ext, selected: true }]);
      setSource("library");
      setStage("preview");
    },
    [canUpload]
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

      ctx.save();
      if (facingMode === "user") {
        ctx.translate(vw, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, vw, vh);
      ctx.restore();

      // Filters are applied to the pixels rather than via ctx.filter, which is
      // silently unsupported on some mobile browsers (older iOS Safari) and
      // would leave the captured photo unfiltered while the preview looked fine.
      const ops = composeFilterOps(filterIndex, hdrOn);
      if (ops.length > 0) {
        const imageData = ctx.getImageData(0, 0, vw, vh);
        applyFilterOps(imageData, ops);
        ctx.putImageData(imageData, 0, 0);
      }

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

  // Waits one paint frame so a just-set state update (e.g. flashActive)
  // actually commits and renders before we move on.
  const waitForPaint = useCallback(() => {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }, []);

  const waitOutFlash = useCallback(() => {
    if (!flashOn) return Promise.resolve();
    return new Promise<void>((resolve) => {
      flashHoldTimeoutRef.current = setTimeout(resolve, FLASH_DURATION_MS);
    });
  }, [flashOn]);

  const waitForTorchWarmup = useCallback(() => {
    return new Promise<void>((resolve) => {
      torchTimeoutRef.current = setTimeout(resolve, TORCH_WARMUP_MS);
    });
  }, []);

  // The rear camera uses the real torch where the hardware exposes it; the front
  // camera (and any device without torch support) falls back to a screen flash.
  const useTorch = flashOn && facingMode === "environment" && torchSupported;

  const runSingleCapture = useCallback(async () => {
    if (useTorch) {
      await setTorch(true);
      await waitForTorchWarmup();
      if (cancelledRef.current) {
        await setTorch(false);
        return;
      }
      const item = await captureFrame();
      await setTorch(false);
      if (cancelledRef.current || !item) return;
      stopStream();
      setPreviewItems([item]);
      setStage("preview");
      return;
    }

    fireFlash();
    await waitForPaint();
    if (cancelledRef.current) return;
    const item = await captureFrame();
    if (cancelledRef.current || !item) return;
    await waitOutFlash();
    if (cancelledRef.current) return;
    stopStream();
    setPreviewItems([item]);
    setStage("preview");
  }, [
    useTorch,
    setTorch,
    waitForTorchWarmup,
    fireFlash,
    waitForPaint,
    captureFrame,
    waitOutFlash,
    stopStream,
  ]);

  const runBurstCapture = useCallback(async () => {
    setIsCapturing(true);
    const items: PreviewItem[] = [];

    // Hold the torch on for the whole burst — toggling per shot is slow and strobes.
    if (useTorch) {
      await setTorch(true);
      await waitForTorchWarmup();
      if (cancelledRef.current) {
        await setTorch(false);
        setIsCapturing(false);
        return;
      }
    }

    for (let i = 0; i < BURST_COUNT; i++) {
      if (cancelledRef.current) {
        if (useTorch) await setTorch(false);
        setIsCapturing(false);
        return;
      }
      if (!useTorch) {
        fireFlash();
        await waitForPaint();
        if (cancelledRef.current) {
          setIsCapturing(false);
          return;
        }
      }
      const item = await captureFrame();
      if (cancelledRef.current) {
        if (useTorch) await setTorch(false);
        setIsCapturing(false);
        return;
      }
      if (item) items.push(item);
      if (i < BURST_COUNT - 1) {
        await new Promise<void>((resolve) => {
          burstTimeoutRef.current = setTimeout(resolve, BURST_INTERVAL_MS);
        });
      } else if (!useTorch) {
        await waitOutFlash();
      }
      if (cancelledRef.current) {
        if (useTorch) await setTorch(false);
        setIsCapturing(false);
        return;
      }
    }

    if (useTorch) await setTorch(false);
    if (cancelledRef.current) return;
    setIsCapturing(false);
    stopStream();
    setPreviewItems(items);
    setStage("preview");
  }, [
    useTorch,
    setTorch,
    waitForTorchWarmup,
    fireFlash,
    waitForPaint,
    captureFrame,
    waitOutFlash,
    stopStream,
  ]);

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
      openLive();
    } else {
      setStage("idle");
      setSource(null);
    }
  }, [source, openLive, resetPreview]);

  const handlePromptScreenCaptureClick = useCallback(() => {
    openLive("environment", { resetSettings: true });
  }, [openLive]);

  // Saving only does local bookkeeping (thumbnail + limit count) up front —
  // the actual network upload is queued to run in the background (see the
  // upload-queue effect above) so the guest isn't stuck waiting on a slow
  // connection and can go straight back to shooting.
  const handleSave = useCallback(async () => {
    const toSave = previewItems.filter((item) => item.selected);
    if (toSave.length === 0) return;

    setIsSaving(true);

    const currentRemaining =
      photoCount === null ? photoLimit : Math.max(photoLimit - photoCount, 0);
    const capped = toSave.slice(0, currentRemaining);
    const skippedForLimit = toSave.length - capped.length;

    const guestName = getStoredGuestName();
    const startingCount = photoCount ?? 0;
    let runningCount = startingCount;
    let localFailures = 0;

    for (const item of capped) {
      try {
        const filename = buildFilename(item.ext);
        const thumb = await createThumbnail(item.url, 640, 0.72);
        runningCount = incrementStoredCount();
        enqueueUpload(item.blob, filename, thumb, guestName || undefined);
      } catch {
        localFailures++;
      }
    }

    setPhotoCount(runningCount);
    if (runningCount !== startingCount) {
      updatePhotoCountNotification(Math.max(photoLimit - runningCount, 0), eventName);
    }

    const messages: string[] = [];
    if (localFailures > 0) {
      messages.push(
        `${localFailures} photo${localFailures === 1 ? "" : "s"} couldn't be processed.`
      );
    }
    if (skippedForLimit > 0) {
      messages.push(
        `${skippedForLimit} photo${skippedForLimit === 1 ? "" : "s"} skipped — limit reached.`
      );
    }
    if (messages.length > 0) showToast(messages.join(" "));

    const anySucceeded = runningCount !== startingCount;
    const allSkippedForLimit = capped.length === 0 && toSave.length > 0;

    setIsSaving(false);

    if (anySucceeded || allSkippedForLimit) {
      resetPreview();
      if (source === "camera" && runningCount < photoLimit) {
        openLive();
      } else {
        setStage("idle");
        setSource(null);
      }
    }
  }, [
    previewItems,
    photoCount,
    eventName,
    photoLimit,
    source,
    enqueueUpload,
    showToast,
    resetPreview,
    openLive,
  ]);

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background p-8 text-center text-foreground">
        <p className="max-w-sm">{error}</p>
        {permissionDenied ? (
          <>
            <button
              onClick={handleTakePhoto}
              className="inline-flex items-center gap-2 rounded-full bg-navy-900 px-6 py-3 font-medium text-ivory transition-colors hover:bg-navy-900/90"
            >
              <RotateCcw size={18} strokeWidth={1.75} />
              Try Again
            </button>
            <button
              onClick={() => {
                setError(null);
                setPermissionDenied(false);
              }}
              className="text-sm text-gray-500 underline underline-offset-2"
            >
              Or choose a photo instead
            </button>
          </>
        ) : (
          <button
            onClick={() => setError(null)}
            className="inline-flex items-center gap-2 rounded-full bg-navy-900 px-6 py-3 font-medium text-ivory transition-colors hover:bg-navy-900/90"
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

      {stage === "idle" &&
        (limitReached ? (
          <div className="bg-gray-50 px-6 py-5 text-center">
            <p className="font-medium text-foreground">
              You&apos;ve shared {photoLimit} photos — thank you!
            </p>
            <p className="mt-1 text-sm text-gray-500">
              That&apos;s the limit per device for tonight. Ask a friend to
              snap the next one!
            </p>
            {myPhotos.length > 0 && (
              <button
                onClick={() => setMyPhotosOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 underline underline-offset-2"
              >
                Delete one to free up a slot
              </button>
            )}
          </div>
        ) : !canUpload ? (
          <div className="bg-gray-50 px-6 py-5 text-center">
            <p className="font-medium text-foreground">
              {eventHasPassed ? "Photo sharing has ended" : "Photo sharing isn't open yet"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {eventHasPassed
                ? `This album was only open for new photos on the day of the event, ${formatEventDate(eventDate)}.`
                : `You can take or add photos starting ${formatEventDate(eventDate)}.`}
            </p>
            {myPhotos.length > 0 && (
              <button
                onClick={() => setMyPhotosOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 underline underline-offset-2"
              >
                View my photos
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            <button
              onClick={handleTakePhoto}
              className="flex items-center gap-3 bg-navy-900 px-4 py-4 text-left transition-colors hover:bg-navy-900/90"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-800">
                <CameraIcon size={22} strokeWidth={1.75} className="text-white" />
              </span>
              <span className="flex-1">
                <span className="block text-base font-semibold text-white">
                  Take Photo
                </span>
                <span className="block text-sm text-white/60">
                  Open camera and capture the moment
                </span>
              </span>
              <ChevronRight
                size={20}
                strokeWidth={1.75}
                className="shrink-0 text-white/50"
              />
            </button>

            <button
              onClick={openLibrary}
              className="flex items-center gap-3 bg-white px-4 py-4 text-left transition-colors hover:bg-gray-50"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                <ImageIcon size={22} strokeWidth={1.75} className="text-blue-600" />
              </span>
              <span className="flex-1">
                <span className="block text-base font-semibold text-foreground">
                  Choose Photo
                </span>
                <span className="block text-sm text-gray-500">
                  Upload from your camera roll
                </span>
              </span>
              <ChevronRight
                size={20}
                strokeWidth={1.75}
                className="shrink-0 text-gray-300"
              />
            </button>

            {myPhotos.length > 0 && (
              <button
                onClick={() => setMyPhotosOpen(true)}
                className="flex items-center gap-3 bg-white px-4 py-4 text-left transition-colors hover:bg-gray-50"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
                  <Images size={22} strokeWidth={1.75} className="text-emerald-600" />
                </span>
                <span className="flex-1">
                  <span className="block text-base font-semibold text-foreground">
                    My Photos ({myPhotos.length})
                  </span>
                  <span className="block text-sm text-gray-500">
                    View or delete what you&apos;ve shared
                  </span>
                </span>
                <ChevronRight
                  size={20}
                  strokeWidth={1.75}
                  className="shrink-0 text-gray-300"
                />
              </button>
            )}
          </div>
        ))}

      {stage === "prompt" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background p-8 text-center text-foreground">
          <p className="max-w-sm text-lg">
            Wedding Photos needs access to your camera to take a photo.
          </p>
          <p className="max-w-sm text-sm text-gray-500">
            Tap Allow below, then choose Allow when your browser asks for
            permission.
          </p>
          <button
            onClick={handlePromptScreenCaptureClick}
            className="inline-flex items-center gap-2 rounded-full bg-navy-900 px-8 py-3 font-medium text-ivory transition-colors hover:bg-navy-900/90"
          >
            <CameraIcon size={18} strokeWidth={1.75} />
            Allow Camera
          </button>
          <button
            onClick={() => setStage("idle")}
            className="inline-flex items-center gap-1 text-sm text-gray-500 underline underline-offset-2"
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
              filter: opsToCss(composeFilterOps(filterIndex, hdrOn)),
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
                flashOn ? "bg-indigo-600 text-ivory" : "bg-camera-bg/60 text-ivory hover:bg-camera-bg/80"
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
                hdrOn ? "bg-indigo-600 text-ivory" : "bg-camera-bg/60 text-ivory hover:bg-camera-bg/80"
              }`}
            >
              HDR
            </button>
            <button
              onClick={() => setBurstOn((v) => !v)}
              aria-label="Toggle burst mode"
              disabled={isCapturing || countdownValue !== null}
              className={`h-10 w-10 rounded-full backdrop-blur flex items-center justify-center transition-colors disabled:opacity-50 ${
                burstOn ? "bg-indigo-600 text-ivory" : "bg-camera-bg/60 text-ivory hover:bg-camera-bg/80"
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
                      ? "bg-indigo-600 text-ivory"
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
                      ? "bg-indigo-600 text-ivory"
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
                className="flex-1 accent-indigo-500 disabled:opacity-50"
              />
              <span className="text-sm">{MAX_ZOOM}x</span>
            </div>

            <button
              onClick={handleCaptureButton}
              aria-label={burstOn ? "Take burst photos" : "Take photo"}
              disabled={isCapturing}
              className={`h-16 w-16 rounded-full border-4 transition-colors disabled:opacity-60 ${
                burstOn ? "border-indigo-500" : "border-ivory"
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
                      item.selected ? "border-indigo-600" : "border-transparent opacity-50"
                    }`}
                  >
                    <img
                      src={item.url}
                      alt={`Burst photo ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <span
                      className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full ${
                        item.selected ? "bg-indigo-600" : "bg-black/40"
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
          <div className="flex flex-col items-center gap-3 pb-4">
            <div className="flex gap-4">
              <button
                onClick={handleRetry}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-full bg-ivory/15 px-6 py-3 text-ivory backdrop-blur transition-colors hover:bg-ivory/25 disabled:opacity-50"
              >
                <RotateCcw size={18} strokeWidth={1.75} />
                Try again
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-full bg-navy-900 px-6 py-3 font-medium text-ivory transition-colors hover:bg-navy-900/90 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={18} strokeWidth={1.75} className="animate-spin" />
                    Saving...
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
        </div>
      )}

      {myPhotosOpen && (
        <div className="fixed inset-0 z-[55] flex flex-col bg-camera-bg">
          <div className="flex shrink-0 items-center justify-between px-5 py-4">
            <h2 className="text-lg font-semibold text-ivory">
              My Photos ({myPhotos.length})
            </h2>
            <button
              onClick={closeMyPhotos}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-ivory/15 text-ivory backdrop-blur hover:bg-ivory/25"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>

          {myPhotos.length === 0 ? (
            <p className="px-5 text-sm text-ivory/70">
              You haven&apos;t shared any photos from this device yet.
            </p>
          ) : (
            <div className="grid flex-1 grid-cols-3 gap-2 overflow-y-auto px-5 pb-6 sm:grid-cols-4">
              {myPhotos.map((photo, index) => {
                const deleting = deletingIds.has(photo.id);
                return (
                  <div key={photo.id} className="relative aspect-square overflow-hidden rounded-lg">
                    <button
                      onClick={() => setMyPhotoPreviewIndex(index)}
                      aria-label="View photo"
                      className="h-full w-full"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.thumbnail}
                        alt="One of your shared photos"
                        className="h-full w-full object-cover"
                      />
                    </button>
                    <button
                      onClick={() => {
                        if (
                          !deleting &&
                          window.confirm("Delete this photo? This can't be undone.")
                        ) {
                          handleDeletePhoto(photo);
                        }
                      }}
                      disabled={deleting}
                      aria-label="Delete photo"
                      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-ivory backdrop-blur transition-colors hover:bg-red-600 disabled:opacity-60"
                    >
                      {deleting ? (
                        <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} strokeWidth={1.75} />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {myPhotosOpen && myPhotoPreviewIndex !== null && myPhotos[myPhotoPreviewIndex] && (
        <div
          className="fixed inset-0 z-[58] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setMyPhotoPreviewIndex(null)}
        >
          <div
            className="relative flex max-h-[85vh] max-w-4xl items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={myPhotos[myPhotoPreviewIndex].thumbnail}
              alt="One of your shared photos"
              className="max-h-full max-w-full rounded-lg object-contain"
            />

            {myPhotos.length > 1 && (
              <>
                <button
                  onClick={myPhotoPreviewPrev}
                  aria-label="Previous photo"
                  className="absolute left-2 rounded-full bg-white/20 p-2 hover:bg-white/30 sm:left-4"
                >
                  <ChevronLeft size={24} className="text-white" strokeWidth={1.75} />
                </button>

                <button
                  onClick={myPhotoPreviewNext}
                  aria-label="Next photo"
                  className="absolute right-2 rounded-full bg-white/20 p-2 hover:bg-white/30 sm:right-4"
                >
                  <ChevronRight size={24} className="text-white" strokeWidth={1.75} />
                </button>
              </>
            )}

            <button
              onClick={() => handleDownloadMyPhoto(myPhotos[myPhotoPreviewIndex])}
              aria-label="Download photo"
              className="absolute left-2 top-2 rounded-full bg-white/20 p-2 hover:bg-white/30"
            >
              <Download size={20} className="text-white" strokeWidth={1.75} />
            </button>

            <button
              onClick={() => {
                const photo = myPhotos[myPhotoPreviewIndex];
                if (
                  !deletingIds.has(photo.id) &&
                  window.confirm("Delete this photo? This can't be undone.")
                ) {
                  handleDeleteFromMyPhotoPreview(photo);
                }
              }}
              disabled={deletingIds.has(myPhotos[myPhotoPreviewIndex].id)}
              aria-label="Delete photo"
              className="absolute right-14 top-2 rounded-full bg-white/20 p-2 hover:bg-red-600 disabled:opacity-60"
            >
              {deletingIds.has(myPhotos[myPhotoPreviewIndex].id) ? (
                <Loader2 size={20} className="animate-spin text-white" strokeWidth={1.75} />
              ) : (
                <Trash2 size={20} className="text-white" strokeWidth={1.75} />
              )}
            </button>

            <button
              onClick={() => setMyPhotoPreviewIndex(null)}
              aria-label="Close preview"
              className="absolute right-2 top-2 rounded-full bg-white/20 p-2 hover:bg-white/30"
            >
              <X size={20} className="text-white" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}

      {uploadQueue.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
          {(() => {
            const failed = uploadQueue.filter((j) => j.status === "error");
            const active = uploadQueue.length - failed.length;
            if (failed.length > 0) {
              return (
                <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm text-ivory shadow-lg">
                  <AlertCircle size={16} strokeWidth={1.75} />
                  <span>
                    {failed.length} photo{failed.length === 1 ? "" : "s"} failed to upload
                  </span>
                  <button
                    onClick={retryFailedUploads}
                    className="rounded-full bg-ivory/20 px-2.5 py-1 text-xs font-medium hover:bg-ivory/30"
                  >
                    Retry
                  </button>
                  <button
                    onClick={dismissFailedUploads}
                    aria-label="Dismiss failed uploads"
                    className="rounded-full p-1 hover:bg-ivory/20"
                  >
                    <X size={14} strokeWidth={1.75} />
                  </button>
                </div>
              );
            }
            if (active > 0) {
              return (
                <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-navy-900 px-4 py-2 text-sm text-ivory shadow-lg">
                  <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />
                  <span>
                    Uploading {active} photo{active === 1 ? "" : "s"}…
                  </span>
                </div>
              );
            }
            return null;
          })()}
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div className="pointer-events-auto max-w-sm rounded-full bg-black/80 px-4 py-2.5 text-center text-sm text-ivory shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </>
  );
}
