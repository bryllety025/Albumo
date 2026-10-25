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

export function uploadTimeoutMs(bytes: number): number {
  return Math.min(TIMEOUT_BASE_MS + bytes * TIMEOUT_MS_PER_BYTE, TIMEOUT_MAX_MS);
}

// Server hiccups and "slow down" answers can clear on their own. Every other 4xx means the request itself was
// refused (too large, malformed, paused event, ...) and sending it again unchanged would be refused again.
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

// A fetch that survives the usual mobile-network trouble: it waits while the phone is offline, gives up on a
// request that stalls, and tries again after a dropped connection or a transient server error. It resolves with
// the first answer that is final -- including a 4xx the caller has to handle, or a 5xx that outlasted every
// retry -- and rejects only when no answer could be had at all. `init.body` must be re-sendable (FormData and
// strings are; a stream is not).
export async function fetchWithRetry(
  url: string,
  init: Omit<RequestInit, "signal">,
  options: { timeoutMs: number; onWait?: (wait: UploadWait | null) => void },
): Promise<Response> {
  const { timeoutMs, onWait } = options;
  let lastError: unknown = new Error("Upload failed");

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (navigator.onLine === false) {
      // Nothing was tried yet, so this doesn't use up an attempt.
      onWait?.("offline");
      if (!(await waitForOnline(OFFLINE_WAIT_MS))) throw new Error("No internet connection");
    }
    onWait?.(null);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (!isRetryableStatus(res.status) || attempt === RETRY_DELAYS_MS.length) return res;
      lastError = new Error(`Server answered ${res.status}`);
      void res.body?.cancel().catch(() => {});
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }

    if (attempt === RETRY_DELAYS_MS.length) break;
    onWait?.("retry");
    // Jittered, so a venue full of phones that all dropped together don't all come back in the same instant.
    await sleep(RETRY_DELAYS_MS[attempt] * (0.75 + Math.random() * 0.5));
  }

  throw lastError;
}
