const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const FOLDER_NAME = "Wedding Photos";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export type DriveFile = {
  id: string;
  name: string;
  createdTime: string;
  mimeType: string;
};

// The drive.file OAuth scope only grants visibility into files/folders this
// app itself created — a folder ID pasted in from Drive's own UI is
// invisible to it. So instead of relying on a fixed folder ID, find (or
// create, on first use) a folder this app owns and reuse that.
let cachedFolderId: string | null = null;

async function findOrCreateFolder(accessToken: string): Promise<string> {
  if (cachedFolderId) return cachedFolderId;

  const query = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME_TYPE}' and trashed=false`
  );
  const listRes = await fetch(`${FILES_URL}?q=${query}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (listRes.ok) {
    const listData = (await listRes.json()) as { files?: { id: string }[] };
    if (listData.files && listData.files.length > 0) {
      cachedFolderId = listData.files[0].id;
      return cachedFolderId;
    }
  }

  const createRes = await fetch(FILES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME_TYPE }),
  });
  if (!createRes.ok) {
    throw new Error(`Failed to create Drive folder: ${await createRes.text()}`);
  }
  const createData = (await createRes.json()) as { id: string };
  cachedFolderId = createData.id;
  return cachedFolderId;
}

async function getAccessToken(): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!res.ok) {
    throw new Error(`Failed to refresh Google access token: ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function uploadToDrive(
  bytes: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  const accessToken = await getAccessToken();
  const boundary = "wedding_photos_upload_boundary";
  const folderId = await findOrCreateFolder(accessToken);

  const metadata: { name: string; parents: string[] } = {
    name: filename,
    parents: [folderId],
  };

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Drive upload failed: ${await res.text()}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function listPhotos(): Promise<DriveFile[]> {
  const accessToken = await getAccessToken();
  const folderId = await findOrCreateFolder(accessToken);

  const query = encodeURIComponent(
    `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`
  );
  const fields = encodeURIComponent(
    "files(id,name,createdTime,mimeType),nextPageToken"
  );

  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const pageParam = pageToken ? `&pageToken=${pageToken}` : "";
    const res = await fetch(
      `${FILES_URL}?q=${query}&fields=${fields}&orderBy=createdTime desc&pageSize=1000${pageParam}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      throw new Error(`Failed to list Drive photos: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      files?: DriveFile[];
      nextPageToken?: string;
    };
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

export async function getDriveFile(
  fileId: string
): Promise<{ bytes: Buffer; mimeType: string; name: string }> {
  const accessToken = await getAccessToken();
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  const metaRes = await fetch(`${FILES_URL}/${fileId}?fields=name,mimeType`, {
    headers: authHeader,
  });
  if (!metaRes.ok) {
    throw new Error(
      `Failed to get Drive file metadata for ${fileId}: ${await metaRes.text()}`
    );
  }
  const { name, mimeType } = (await metaRes.json()) as {
    name: string;
    mimeType: string;
  };

  const contentRes = await fetch(`${FILES_URL}/${fileId}?alt=media`, {
    headers: authHeader,
  });
  if (!contentRes.ok) {
    throw new Error(
      `Failed to get Drive file content for ${fileId}: ${await contentRes.text()}`
    );
  }
  const bytes = Buffer.from(await contentRes.arrayBuffer());

  return { bytes, mimeType, name };
}
