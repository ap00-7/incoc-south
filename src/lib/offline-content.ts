const databaseName = "incoc-south-offline";
const databaseVersion = 1;
const storeName = "public-content";

type StoredSnapshot<T> = {
  key: string;
  syncedAt: number;
  data: T;
};

function openDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("This browser does not support offline content storage."));
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to open offline content storage."));
    request.onblocked = () => reject(new Error("Offline content storage is blocked by another browser tab."));
  });
}

export async function readPublicSnapshot<T>(key: string): Promise<T | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readonly");
    const finished = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to read offline content."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Offline content read was interrupted."));
    });
    const result = await new Promise<StoredSnapshot<T> | undefined>((resolve, reject) => {
      const request = transaction.objectStore(storeName).get(key) as IDBRequest<StoredSnapshot<T> | undefined>;
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to read offline content."));
    });
    await finished;
    return result?.data ?? null;
  } finally {
    database.close();
  }
}

export async function savePublicSnapshot<T>(key: string, data: T, syncedAt: number) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const finished = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save offline content."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Offline content save was interrupted."));
    });
    const request = store.get(key) as IDBRequest<StoredSnapshot<T> | undefined>;
    request.onsuccess = () => {
      if (!request.result || request.result.syncedAt < syncedAt) {
        store.put({ key, syncedAt, data } satisfies StoredSnapshot<T>);
      }
    };
    await finished;
  } finally {
    database.close();
  }
}

export function reportOfflineCacheError(error: unknown) {
  const message = error instanceof Error ? error.message : "Offline content could not be saved.";
  console.error("INCOC South offline content storage failed:", error);
  window.dispatchEvent(new CustomEvent("incoc:offline-cache-error", { detail: message }));
}
