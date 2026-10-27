// Why a photo upload is sitting still: waiting out a short pause before trying again ("retry"), or waiting for the
// phone to get a connection back ("offline"). Shown to the guest so a slow upload doesn't look like a frozen one.
export type UploadWait = "retry" | "offline";

// Pauses between attempts, so a photo gets 1 + this many tries before the guest is bothered with a red "failed"
// bar. Short enough that a blip is over by the first retry, long enough for a patchy signal to settle.
const RETRY_DELAYS_MS = [1500, 4000, 10000];

// How long to wait for the phone to report a connection before giving up on a photo (the guest can still hit
// Retry, and it is retried on its own the moment the browser says it is back online).
const OFFLINE_WAIT_MS = 120_000;

// A request that makes no progress is cut off after this much, plus a second per ~40 KB of the photo (a floor of
// about 320 kbit/s), so one stalled connection can't hold up every photo queued behind it.
const TIMEOUT_BASE_MS = 45_000;
const TIMEOUT_MS_PER_BYTE = 1000 / 40_000;
const TIMEOUT_MAX_MS = 300_000;

export function uploadTimeoutMs(bytes: number, maxMs = TIMEOUT_MAX_MS): number {
  return Math.min(TIMEOUT_BASE_MS + bytes * TIMEOUT_MS_PER_BYTE, maxMs);
}

// Server hiccups and "slow down" answers can clear on their own. Every other 4xx means the request itself was
// refused (too large, malformed, paused event, ...) and sending it again unchanged would be refused again.
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** How many times `retryPause` has a pause for: the number of retries a photo gets after its first try. */
export const RETRY_COUNT = RETRY_DELAYS_MS.length;

/** The pause before retry number `retryIndex` (0 is the first retry), jittered like every other retry here. */
export function retryPause(retryIndex: number): Promise<void> {
  // Jittered, so a venue full of phones that all dropped together don't all come back in the same instant.
  return sleep(RETRY_DELAYS_MS[Math.min(retryIndex, RETRY_COUNT - 1)] * (0.75 + Math.random() * 0.5));
}

// Resolves true the moment the browser reports a connection, false if that takes longer than `ms`.
function waitForOnline(ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (online: boolean) => {
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      resolve(online);
    };
    const onOnline = () => done(true);
    const timer = setTimeout(() => done(false), ms);
    window.addEventListener("online", onOnline);
  });
}

// The retry loop every upload request goes through: it waits while the phone is offline, runs `attempt`, and runs
// it again after a thrown error (a dropped connection, a stalled request) or a result `retryable` says can clear
// on its own. It resolves with the first result that is final -- including one that outlasted every retry -- and
// rejects only when no result could be had at all. `discard` lets go of a result that is being retried.
export async function retryUpload<T>(
  attempt: () => Promise<T>,
  options: {
    retryable: (result: T) => boolean;
    discard?: (result: T) => void;
    onWait?: (wait: UploadWait | null) => void;
  },
): Promise<T> {
  const { retryable, discard, onWait } = options;
  let lastError: unknown = new Error("Upload failed");

  for (let tries = 0; tries <= RETRY_DELAYS_MS.length; tries++) {
    if (navigator.onLine === false) {
      // Nothing was tried yet, so this doesn't use up an attempt.
      onWait?.("offline");
      if (!(await waitForOnline(OFFLINE_WAIT_MS))) throw new Error("No internet connection");
    }
    onWait?.(null);

    try {
      const result = await attempt();
      if (!retryable(result) || tries === RETRY_DELAYS_MS.length) return result;
      lastError = new Error("Not accepted yet");
      discard?.(result);
    } catch (err) {
      lastError = err;
    }

    if (tries === RETRY_DELAYS_MS.length) break;
    onWait?.("retry");
    await retryPause(tries);
  }

  throw lastError;
}

// A fetch that survives the usual mobile-network trouble: it waits while the phone is offline, gives up on a
// request that stalls, and tries again after a dropped connection or a transient server error. It resolves with
// the first answer that is final -- including a 4xx the caller has to handle, or a 5xx that outlasted every
// retry -- and rejects only when no answer could be had at all. `init.body` must be re-sendable (FormData and
// strings are; a stream is not).
export function fetchWithRetry(
  url: string,
  init: Omit<RequestInit, "signal">,
  options: { timeoutMs: number; onWait?: (wait: UploadWait | null) => void },
): Promise<Response> {
  return retryUpload(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    },
    {
      retryable: (res) => isRetryableStatus(res.status),
      discard: (res) => void res.body?.cancel().catch(() => {}),
      onWait: options.onWait,
    },
  );
}
