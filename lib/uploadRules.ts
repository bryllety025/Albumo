// What a photo sent straight to S3 has to look like. The server signs its upload form for exactly this (see
// /api/upload/prepare), and the camera checks the same rules to know whether a photo can go that way at all.

// What buildFilename in Camera.tsx makes: "photo-" + an ISO timestamp with ":" and "." turned into "-", then the
// extension. Strict on purpose -- the name becomes part of an S3 key, so no "/" or ".." can get in.
export const PHOTO_FILENAME_PATTERN = /^photo-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.[A-Za-z0-9]{1,10}$/;

// Photo formats only. In particular not image/svg+xml: the gallery serves a photo back with the type it was
// stored under, and an SVG shown from this site's own address can run scripts.
const PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/bmp",
  "image/tiff",
]);

export function isPhotoType(type: string): boolean {
  return PHOTO_TYPES.has(type);
}

// Far above any phone photo (a 200 MP JPEG is around 50 MB); only there so an upload form can't be used for
// something enormous.
export const MAX_PHOTO_BYTES = 200 * 1024 * 1024;
