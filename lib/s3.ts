import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

function keyPrefix(): string {
  // Optional folder/prefix inside the bucket, configurable via env so it
  // can be changed without touching code. Normalized to have no
  // leading/trailing slashes, then re-joined with a single trailing slash
  // when non-empty.
  const folder = (process.env.AWS_S3_FOLDER?.trim() ?? "").replace(
    /^\/+|\/+$/g,
    ""
  );
  return folder ? `${folder}/` : "";
}

// Constructed lazily (per call, not at module load) so that importing this
// module — which happens during `next build`'s page-data collection — never
// requires real AWS credentials to be present.
function getClient(): S3Client {
  return new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
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
  bytes: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: `${keyPrefix()}${filename}`,
      Body: bytes,
      ContentType: mimeType,
    })
  );
  return filename;
}

export async function listPhotos(): Promise<PhotoFile[]> {
  const prefix = keyPrefix();
  const client = getClient();
  const files: PhotoFile[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: process.env.AWS_S3_BUCKET!,
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
  id: string
): Promise<{ bytes: Buffer; mimeType: string; name: string }> {
  const res = await getClient().send(
    new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: `${keyPrefix()}${id}`,
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
