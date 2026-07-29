import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import type { TenantConfig } from "./tenant";

function keyPrefix(folder: string): string {
  // Normalized to have no leading/trailing slashes, then re-joined with a
  // single trailing slash when non-empty.
  const cleaned = folder.trim().replace(/^\/+|\/+$/g, "");
  return cleaned ? `${cleaned}/` : "";
}

// Constructed lazily (per call, not at module load) so that importing this
// module — which happens during `next build`'s page-data collection — never
// requires real AWS credentials to be present.
function getClient(config: TenantConfig): S3Client {
  return new S3Client({
    region: config.awsRegion,
    credentials: {
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey,
    },
  });
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
  config: TenantConfig,
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

export async function listPhotos(config: TenantConfig): Promise<PhotoFile[]> {
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

export async function getPhoto(
  config: TenantConfig,
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
