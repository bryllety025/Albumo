// A photo that hasn't reached the server yet lives in this device's own storage (IndexedDB, which -- unlike
// localStorage -- can hold the picture itself). It is written there BEFORE its first upload attempt and removed
// only once the server has confirmed it, so nothing a guest took is lost to a dropped connection, a closed tab,
// a phone that ran out of battery or a browser that killed the page in the background: the next time the guest
// opens the app, whatever hadn't gone up is picked up and sent again (see the restore effect in Camera.tsx).
//
// Everything here is best-effort and never throws: a browser with no IndexedDB (some private modes) or a full
// disk just means photos are uploaded straight from memory as before, without the safety net.

const DB_NAME = "albumo-upload-cache";
const STORE = "uploads";

// An event stops taking photos a few days after it is over (see LATE_UPLOAD_DAYS), so a photo that is still here
// after this long can never be accepted: it is thrown away rather than kept forever.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type CachedUpload = {
  /** `<event slug>/<filename>`: unique per photo, and what the record is stored under. */
  key: string;
  slug: string;
  filename: string;
  blob: Blob;
  /** The small preview shown in "My photos" once the upload is done. */
  thumbnail: string;
  uploaderName?: string;
  createdAt: number;
};

export function uploadCacheKey(slug: string, filename: string): string {
  return `${slug}/${filename}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined" || !indexedDB) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE, { keyPath: "key" });
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab upgrading the database, or the browser reclaiming it: start over on the next call.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error("Could not open the upload cache"));
      request.onblocked = () => reject(new Error("Upload cache blocked"));
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

// Resolves when the transaction has COMMITTED (not merely when the request was accepted), which is the point the
// data is safely on disk.
function runTransaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error ?? request.error);
        tx.onabort = () => reject(tx.error ?? new Error("Upload cache transaction aborted"));
      }),
  );
}

/** Stores the photo. Resolves true once it is safely on disk, false if it could not be (never rejects). */
export async function cacheUpload(upload: CachedUpload): Promise<boolean> {
  try {
    await runTransaction("readwrite", (store) => store.put(upload));
    return true;
  } catch {
    return false;
  }
}

/** Forgets a photo: it was uploaded, or the guest/server gave up on it. Safe to call for one that isn't stored. */
export async function uncacheUpload(key: string): Promise<void> {
  try {
    await runTransaction("readwrite", (store) => store.delete(key));
  } catch {
    // Worst case the photo is offered again next time and the server (which treats a repeated name as the same
    // photo) is told once more.
  }
}

/** Every photo of this event that never finished uploading, oldest first. Also clears out expired ones. */
export async function loadCachedUploads(slug: string): Promise<CachedUpload[]> {
  try {
    const all = await runTransaction<CachedUpload[]>("readonly", (store) => store.getAll() as IDBRequest<CachedUpload[]>);
    const cutoff = Date.now() - MAX_AGE_MS;
    const fresh: CachedUpload[] = [];
    for (const record of all) {
      if (typeof record?.createdAt !== "number" || record.createdAt < cutoff) {
        if (record?.key) void uncacheUpload(record.key);
        continue;
      }
      if (record.slug === slug && record.blob instanceof Blob && typeof record.filename === "string") {
        fresh.push(record);
      }
    }
    return fresh.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}
