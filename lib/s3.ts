import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import type { EventConfig } from "./event";

function keyPrefix(folder: string): string {
  // Normalized to have no leading/trailing slashes, then re-joined with a
  // single trailing slash when non-empty.
  const cleaned = folder.trim().replace(/^\/+|\/+$/g, "");
  return cleaned ? `${cleaned}/` : "";
}

// Every event shares the same AWS credentials/bucket (see lib/event.ts), so
// a single client is built once and reused for every request. It's built
// lazily (on first use, not at module load) so that importing this module —
// which happens during `next build`'s page-data collection — never requires
// real AWS credentials to be present.
let client: S3Client | undefined;

function getClient(config: EventConfig): S3Client {
  if (!client) {
    client = new S3Client({
      region: config.awsRegion,
      credentials: {
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey,
      },
    });
  }
  return client;
}

export type PhotoFile = {
  id: string;
  name: string;
  createdTime: string;
  mimeType: string;
};

const EXT_MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
};

function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME_TYPES[ext] ?? "application/octet-stream";
}

// Photo ids are just the filename (no slashes — see buildFilename in
// Camera.tsx), so they're safe to use directly as a [id] route segment. The
// configurable folder prefix is only ever applied internally when talking
// to S3, never exposed to the client.
export async function uploadPhoto(
  config: EventConfig,
  bytes: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  await getClient(config).send(
    new PutObjectCommand({
      Bucket: config.awsS3Bucket,
      Key: `${keyPrefix(config.awsS3Folder)}${filename}`,
      Body: bytes,
      ContentType: mimeType,
    })
  );
  return filename;
}

// How long a guest's phone has to START sending a photo with the form below. S3 checks this when the request
// begins, so a slow upload that started in time is not cut off by it. A fresh form is asked for before every attempt.
const UPLOAD_FORM_TTL_SECONDS = 10 * 60;

// A form the guest's phone can POST one photo to straight at S3, so the bytes never pass through this server. The
// credentials of this app sign it; the phone never sees them. It is good for exactly this key, this content type
// and this many bytes (all three are in the signed policy, and S3 refuses an upload that differs), so it can't be
// used to put anything else in the bucket, or anywhere else in it.
//
// A POST (not a PUT) on purpose: a form-style POST is a "simple" cross-origin request, which a browser sends
// without first asking S3's permission, so the bucket needs no CORS setting at all. The price is that the browser
// can't read S3's answer; the caller finds out whether the photo arrived with getUploadedSize instead.
export async function createUploadForm(
  config: EventConfig,
  filename: string,
  mimeType: string,
  size: number
): Promise<{ url: string; fields: Record<string, string> }> {
  return createPresignedPost(getClient(config), {
    Bucket: config.awsS3Bucket,
    Key: `${keyPrefix(config.awsS3Folder)}${filename}`,
    Fields: { "Content-Type": mimeType },
    Conditions: [["content-length-range", size, size]],
    Expires: UPLOAD_FORM_TTL_SECONDS,
  });
}

// The size in bytes of a photo that has been uploaded, or null if there is no such photo (yet).
export async function getUploadedSize(config: EventConfig, filename: string): Promise<number | null> {
  try {
    const res = await getClient(config).send(
      new HeadObjectCommand({
        Bucket: config.awsS3Bucket,
        Key: `${keyPrefix(config.awsS3Folder)}${filename}`,
      })
    );
    return res.ContentLength ?? 0;
  } catch (err) {
    // A HEAD has no body to carry S3's error code, so "not there" arrives as a 404 / NotFound.
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name === "NotFound" || e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

export async function listPhotos(config: EventConfig): Promise<PhotoFile[]> {
  const prefix = keyPrefix(config.awsS3Folder);
  const client = getClient(config);
  const files: PhotoFile[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: config.awsS3Bucket,
        Prefix: prefix || undefined,
        ContinuationToken: continuationToken,
      })
    );

    for (const obj of res.Contents ?? []) {
      if (!obj.Key || obj.Key.endsWith("/")) continue;
      const name = obj.Key.slice(prefix.length);
      files.push({
        id: name,
        name,
        createdTime: (obj.LastModified ?? new Date()).toISOString(),
        mimeType: guessMimeType(name),
      });
    }

    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  files.sort((a, b) => Date.parse(b.createdTime) - Date.parse(a.createdTime));
  return files;
}

export async function deletePhoto(config: EventConfig, id: string): Promise<void> {
  await getClient(config).send(
    new DeleteObjectCommand({
      Bucket: config.awsS3Bucket,
      Key: `${keyPrefix(config.awsS3Folder)}${id}`,
    })
  );
}

export async function getPhoto(
  config: EventConfig,
  id: string
): Promise<{ bytes: Buffer; mimeType: string; name: string }> {
  const res = await getClient(config).send(
    new GetObjectCommand({
      Bucket: config.awsS3Bucket,
      Key: `${keyPrefix(config.awsS3Folder)}${id}`,
    })
  );

  if (!res.Body) {
    throw new Error(`Empty S3 response body for ${id}`);
  }
  const bytes = Buffer.from(await res.Body.transformToByteArray());

  return {
    bytes,
    mimeType: res.ContentType ?? guessMimeType(id),
    name: id,
  };
}

// An event's cover photo lives outside the event's own folder (so it never
// shows up as a guest photo): albumo-backend writes it to
// `_covers/<slug>/<name>`. `name` must already have been checked against
// COVER_NAME_PATTERN by the caller -- it's only ever joined onto this fixed
// prefix, never used to reach elsewhere in the bucket.
export async function getCover(config: EventConfig, name: string): Promise<Buffer> {
  const res = await getClient(config).send(
    new GetObjectCommand({
      Bucket: config.awsS3Bucket,
      Key: `_covers/${config.slug}/${name}`,
    })
  );

  if (!res.Body) {
    throw new Error(`Empty S3 response body for cover ${name}`);
  }
  return Buffer.from(await res.Body.transformToByteArray());
}

// One page of a saved album, as the picture albumo-backend was sent when the owner shared it. Like the cover
// photo these live outside the event's own folder (`_albums/<slug>/<albumId>/<n>.jpg`, n counting from 0 at the
// cover), so they never show up as a guest photo. `albumId` must already have been checked against
// ALBUM_ID_PATTERN and `index` be a whole number by the caller -- they're only ever joined onto this fixed
// prefix, never used to reach elsewhere in the bucket.
export async function getAlbumPage(config: EventConfig, albumId: string, index: number): Promise<Buffer> {
  const res = await getClient(config).send(
    new GetObjectCommand({
      Bucket: config.awsS3Bucket,
      Key: `_albums/${config.slug}/${albumId}/${index}.jpg`,
    })
  );

  if (!res.Body) {
    throw new Error(`Empty S3 response body for album page ${albumId}/${index}`);
  }
  return Buffer.from(await res.Body.transformToByteArray());
}
