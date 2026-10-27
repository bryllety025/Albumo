// Sends one photo to the event. The normal way is straight from the phone to S3, so a big photo never has to
// squeeze through this app's server. That matters on Vercel, which refuses any request body over 4.5 MB before the
// app even sees it: sent through the server, every photo bigger than that failed.
//
//   1. POST /api/upload/prepare   -- the server checks the guest may add a photo and answers with a one-photo form
//   2. POST <that form's URL>     -- the phone sends the photo to S3 itself
//   3. POST /api/upload/complete  -- the server looks that it arrived in the bucket and registers it (limits, who shared it)
//
// Step 2 is sent in "no-cors" mode. A form-style POST like that is a "simple" cross-origin request, which a browser
// sends without first asking S3 for permission, so the bucket needs no CORS setting. The price is that the browser
// won't let this code read S3's answer, so step 3 is what finds out whether the photo really arrived.
//
// If a photo can't go that way (S3 can't be reached from this phone, or doesn't keep what was sent), it goes
// through the server instead -- which only works for photos small enough to pass the host's body limit.

import { MAX_PHOTO_BYTES, PHOTO_FILENAME_PATTERN, isPhotoType } from "./uploadRules";
import {
  RETRY_COUNT,
  fetchWithRetry,
  isRetryableStatus,
  retryPause,
  retryUpload,
  uploadTimeoutMs,
  type UploadWait,
} from "./uploadRetry";

export type PhotoToSend = {
  blob: Blob;
  filename: string;
  /**
   * Set once the photo has been sent to S3 but not yet registered, so that finishing it after a hiccup (or after the
   * guest has dealt with a password or name prompt) doesn't send the whole photo again. Kept by the caller between
   * calls.
   */
  stored?: boolean;
};

export type SendOptions = {
  uploaderName?: string;
  uploaderToken?: string | null;
  onWait?: (wait: UploadWait | null) => void;
};

// A request to our own server that carries no photo.
const SMALL_REQUEST_TIMEOUT_MS = 30_000;

// A form POST in no-cors mode reports no progress, so the photo to S3 gets one overall time limit: the same floor
// as a photo sent through the server (about 320 kbit/s), but allowed to run longer, since nothing else is held up.
const DIRECT_TIMEOUT_MAX_MS = 600_000;

// How many times a photo that S3 didn't keep is sent again: as many retries as any other failed request gets.
const RESEND_LIMIT = RETRY_COUNT;

// After a photo had to go through the server because S3 wouldn't take it from this phone, later photos skip the
// direct attempt (and its retries) for this long, then try again.
const SKIP_DIRECT_FOR_MS = 10 * 60_000;
let skipDirectUntil = 0;

/**
 * The photo can't go straight to S3, so it should go through the server instead: the request to S3 failed outright
 * (no route to it) or timed out, S3 didn't keep what was sent, or this server doesn't take photos that way.
 * `rememberIfServerWorks` says whether that is a reason to stop trying S3 for a while once the server has taken a
 * photo (true), or just something about this one photo (false).
 */
class DirectUploadFailed extends Error {
  constructor(
    message: string,
    readonly rememberIfServerWorks: boolean,
  ) {
    super(message);
  }
}

function jsonRequest(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// A request to our own server with a time limit.
async function fetchSmall(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SMALL_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Sends the photo to S3 with the form the server signed. Resolves once S3 has answered -- with whatever status: the
// answer is opaque to this code -- and rejects with DirectUploadFailed when the request fails outright or times out.
async function postToS3(form: { url: string; fields: Record<string, string> }, photo: PhotoToSend): Promise<void> {
  const body = new FormData();
  for (const [name, value] of Object.entries(form.fields)) body.append(name, value);
  // S3 ignores everything after this field, so it has to be the last one.
  body.append("file", photo.blob, photo.filename);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), uploadTimeoutMs(photo.blob.size, DIRECT_TIMEOUT_MAX_MS));
  try {
    await fetch(form.url, { method: "POST", mode: "no-cors", body, signal: controller.signal });
  } catch (err) {
    throw new DirectUploadFailed(err instanceof Error ? err.message : "Couldn't reach S3", true);
  } finally {
    clearTimeout(timer);
  }
}

type StepResult = { step: "prepare"; response: Response } | { step: "sent" };

// Steps 1 and 2. Resolves with the server's answer when it turned the photo down (or kept failing), null when the
// photo has been sent. Asks for a fresh form on every attempt, so a retry after a long wait never meets an expired one.
async function sendToS3(photo: PhotoToSend, contentType: string, options: SendOptions): Promise<Response | null> {
  const result = await retryUpload<StepResult>(
    async () => {
      const response = await fetchSmall(
        "/api/upload/prepare",
        jsonRequest({
          filename: photo.filename,
          contentType,
          size: photo.blob.size,
          uploaderName: options.uploaderName,
        }),
      );
      if (!response.ok) return { step: "prepare", response };
      await postToS3((await response.json()) as { url: string; fields: Record<string, string> }, photo);
      return { step: "sent" };
    },
    {
      retryable: (r) => r.step === "prepare" && isRetryableStatus(r.response.status),
      discard: (r) => {
        if (r.step === "prepare") void r.response.body?.cancel().catch(() => {});
      },
      onWait: options.onWait,
    },
  );

  if (result.step === "sent") return null;
  const { response } = result;
  // A server that doesn't have the route (an older version, after a rollback)...
  if (response.status === 404) throw new DirectUploadFailed("This server doesn't take direct uploads", true);
  // ...or one whose rules about what can be sent this way differ from this page's (the page is older than the
  // server): the old route takes the photo whatever it is called.
  if (response.status === 400 && ((await response.clone().json().catch(() => null)) as { code?: string } | null)?.code === "invalid_upload") {
    throw new DirectUploadFailed("The server won't sign this photo", false);
  }
  return response;
}

// The whole direct route. Resolves with what /api/upload/complete (or, earlier, /api/upload/prepare) answered, in
// the same shapes /api/upload does; throws DirectUploadFailed when the photo can't go this way.
async function sendDirect(photo: PhotoToSend, contentType: string, options: SendOptions): Promise<Response> {
  // S3 never says whether it kept the photo (a "slow down" or a refusal looks the same as success from here), so
  // the first look in the bucket (step 3) may find it missing. It is then sent again, after a pause, like any
  // other failed attempt, before giving up on S3.
  for (let resends = 0; ; resends++) {
    if (!photo.stored) {
      const turnedDown = await sendToS3(photo, contentType, options);
      if (turnedDown) return turnedDown;
      photo.stored = true;
    }

    const res = await fetchWithRetry(
      "/api/upload/complete",
      jsonRequest({
        filename: photo.filename,
        uploaderName: options.uploaderName,
        uploaderToken: options.uploaderToken ?? undefined,
      }),
      { timeoutMs: SMALL_REQUEST_TIMEOUT_MS, onWait: options.onWait },
    );
    const missing = res.status === 404 && ((await res.clone().json().catch(() => null)) as { code?: string } | null)?.code === "not_uploaded";
    if (!missing) return res;

    photo.stored = false;
    if (resends >= RESEND_LIMIT) throw new DirectUploadFailed("S3 didn't keep the photo", true);
    options.onWait?.("retry");
    await retryPause(resends);
  }
}

// The photo as the request body, to the app's own server, which puts it into S3 itself.
function sendThroughServer(photo: PhotoToSend, options: SendOptions): Promise<Response> {
  const formData = new FormData();
  formData.append("file", photo.blob, photo.filename);
  formData.append("filename", photo.filename);
  if (options.uploaderName) formData.append("uploaderName", options.uploaderName);
  if (options.uploaderToken) formData.append("uploaderToken", options.uploaderToken);
  return fetchWithRetry(
    "/api/upload",
    { method: "POST", body: formData },
    { timeoutMs: uploadTimeoutMs(photo.blob.size), onWait: options.onWait },
  );
}

/**
 * Sends the photo and resolves with the server's final answer: `{ fileId, photoCount }` when it is in, or the
 * refusal (401 password, 400 name_required, 403 closed/paused, 409 limits) for the caller to act on. Rejects when
 * it could not be sent at all (no connection, no answer after retrying).
 */
export async function sendPhoto(photo: PhotoToSend, options: SendOptions): Promise<Response> {
  const contentType = photo.blob.type || "image/jpeg";
  const canGoDirect =
    Date.now() >= skipDirectUntil &&
    PHOTO_FILENAME_PATTERN.test(photo.filename) &&
    isPhotoType(contentType) &&
    photo.blob.size > 0 &&
    photo.blob.size <= MAX_PHOTO_BYTES;
  if (!canGoDirect) return sendThroughServer(photo, options);

  try {
    return await sendDirect(photo, contentType, options);
  } catch (err) {
    if (!(err instanceof DirectUploadFailed)) throw err;
    // Not possible straight to S3 from this phone. The server can still do it, for a photo small enough.
    const res = await sendThroughServer(photo, options);
    if (res.ok && err.rememberIfServerWorks) skipDirectUntil = Date.now() + SKIP_DIRECT_FOR_MS;
    return res;
  }
}
