import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  HardDrive,
  Image,
  LoaderCircle,
  Presentation,
  RefreshCw,
  Search,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { useAuth } from "@/spa/auth-provider";

const STORAGE_PAGE_SIZE = 100;
const FILES_PER_PAGE = 30;
const KNOWN_APPLICATION_BUCKETS = ["schedule-media", "announcement-images"];

type Bucket = {
  id: string;
  name: string;
  public: boolean | null;
};

type StoredObject = {
  bucket: string;
  path: string;
  name: string;
  metadata: Record<string, unknown> | null;
  createdAt: string | null;
  updatedAt: string | null;
  publicBucket: boolean;
};

type BucketInventory = {
  bucket: Bucket;
  files: StoredObject[];
  errors: string[];
};

type Inventory = {
  buckets: BucketInventory[];
  discoveryError: string;
};

type Reference = {
  label: string;
  values: string[];
  rawPathBucket?: string;
};

type DeleteDialogState = {
  file: StoredObject;
  phase: "checking" | "ready" | "referenced" | "reference-error" | "deleting" | "delete-error";
  references: Reference[];
  error: string;
};

type ObjectEntry = {
  id: string | null;
  name: string;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

type SizeInfo = {
  bytes: number | null;
};

function isImage(file: StoredObject) {
  const mimeType = String(file.metadata?.mimetype ?? file.metadata?.contentType ?? "");
  return mimeType.startsWith("image/") || /\.(avif|gif|jpe?g|png|svg|webp|bmp|tiff?)$/i.test(file.name);
}

function isDocument(file: StoredObject) {
  const mimeType = String(file.metadata?.mimetype ?? file.metadata?.contentType ?? "");
  return /^(application\/pdf|application\/vnd\.openxmlformats-officedocument\.(presentationml|wordprocessingml|spreadsheetml)|application\/vnd\.ms-(powerpoint|word|excel)|text\/(plain|csv))/i.test(mimeType)
    || /\.(pdf|pptx?|docx?|xlsx?|csv|txt|odp|odt|ods)$/i.test(file.name);
}

function getFileSize(file: StoredObject): SizeInfo {
  const rawSize = file.metadata?.size;
  if (typeof rawSize !== "number" && typeof rawSize !== "string") return { bytes: null };
  const bytes = Number(rawSize);
  return Number.isFinite(bytes) && bytes >= 0 ? { bytes } : { bytes: null };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${units[unitIndex]}`;
}

function formatDate(value: string | null) {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(parsed);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

async function loadStoragePages<T>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
) {
  const items: T[] = [];
  for (let from = 0; ; from += STORAGE_PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + STORAGE_PAGE_SIZE - 1);
    if (error) throw new Error(`Unable to check ${label}: ${error.message}`);
    const page = data ?? [];
    items.push(...page);
    if (page.length < STORAGE_PAGE_SIZE) return items;
  }
}

async function loadStorageBuckets() {
  const supabase = createClient();
  const buckets: Bucket[] = [];
  for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
    const { data, error } = await supabase.storage.listBuckets({
      limit: STORAGE_PAGE_SIZE,
      offset,
      sortColumn: "id",
      sortOrder: "asc",
    });
    if (error) throw new Error(error.message);
    const page = (data ?? []).map((bucket) => ({
      id: bucket.id,
      name: bucket.name,
      public: bucket.public,
    }));
    buckets.push(...page);
    if (page.length < STORAGE_PAGE_SIZE) return buckets;
  }
}

async function listBucketObjects(bucket: Bucket): Promise<BucketInventory> {
  const supabase = createClient();
  const files: StoredObject[] = [];
  const errors: string[] = [];
  const pendingFolders = [""];
  const visitedFolders = new Set<string>();

  while (pendingFolders.length) {
    const folder = pendingFolders.shift();
    if (folder === undefined || visitedFolders.has(folder)) continue;
    visitedFolders.add(folder);
    let offset = 0;
    while (true) {
      let entries: ObjectEntry[];
      try {
        const { data, error } = await supabase.storage.from(bucket.name).list(folder, {
          limit: STORAGE_PAGE_SIZE,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error) throw new Error(error.message);
        entries = (data ?? []) as ObjectEntry[];
      } catch (error) {
        errors.push(`${folder || "bucket root"}: ${getErrorMessage(error)}`);
        break;
      }

      for (const entry of entries) {
        const path = folder ? `${folder}/${entry.name}` : entry.name;
        if (entry.id === null) {
          if (!visitedFolders.has(path)) pendingFolders.push(path);
          continue;
        }
        files.push({
          bucket: bucket.name,
          path,
          name: entry.name,
          metadata: entry.metadata,
          createdAt: entry.created_at,
          updatedAt: entry.updated_at,
          publicBucket: bucket.public === true,
        });
      }
      if (entries.length < STORAGE_PAGE_SIZE) break;
      offset += STORAGE_PAGE_SIZE;
    }
  }

  return { bucket, files, errors };
}

function storageObjectFromUrl(value: string, expectedOrigin: string) {
  try {
    const url = new URL(value);
    if (url.origin !== expectedOrigin) return null;
    const segments = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
    const objectIndex = segments.indexOf("object");
    let bucketIndex: number;
    if (objectIndex >= 0) {
      if (segments[objectIndex - 1] !== "v1" || segments[objectIndex - 2] !== "storage") return null;
      bucketIndex = objectIndex + 1;
      const accessType = segments[bucketIndex];
      if (accessType === "public" || accessType === "sign" || accessType === "authenticated") bucketIndex += 1;
    } else {
      const renderIndex = segments.findIndex((part, index) => part === "render" && segments[index + 1] === "image");
      if (renderIndex < 2 || segments[renderIndex - 1] !== "v1" || segments[renderIndex - 2] !== "storage"
        || !["public", "sign", "authenticated"].includes(segments[renderIndex + 2])) return null;
      bucketIndex = renderIndex + 3;
    }
    const bucket = segments[bucketIndex];
    const path = segments.slice(bucketIndex + 1).join("/");
    return bucket && path ? { bucket, path } : null;
  } catch {
    return null;
  }
}

function objectIsReferenced(file: StoredObject, reference: Reference, expectedOrigin: string) {
  const urlPattern = /https?:\/\/[^\s"'<>]+/gi;
  for (const value of reference.values) {
    const raw = value.trim();
    if (raw === `${file.bucket}/${file.path}`) return true;
    if (reference.rawPathBucket === file.bucket && raw === file.path) return true;
    const candidates = raw.match(urlPattern) ?? [];
    if (/^https?:\/\//i.test(raw)) candidates.push(raw);
    for (const candidate of candidates) {
      const trimmed = candidate.replace(/[.,;!?)\]]+$/, "");
      const parsed = storageObjectFromUrl(trimmed, expectedOrigin);
      if (parsed?.bucket === file.bucket && parsed.path === file.path) return true;
    }
  }
  return false;
}

async function loadReferences(churchId: string): Promise<Reference[]> {
  const supabase = createClient();
  const [
    announcementItems,
    announcementCollections,
    scheduleItems,
    schedules,
    presentationSessions,
    songs,
  ] = await Promise.all([
    loadStoragePages((from, to) => supabase.from("announcement_items")
      .select("id, title, image_url, body, collection_id")
      .eq("church_id", churchId).order("id").range(from, to), "announcement references"),
    loadStoragePages((from, to) => supabase.from("announcement_collections")
      .select("id, collection_name, is_published")
      .eq("church_id", churchId).order("id").range(from, to), "announcement collections"),
    loadStoragePages((from, to) => supabase.from("schedule_items")
      .select("id, title, media_url, background_image_url, link_url, public_content, schedule_id")
      .eq("church_id", churchId).order("id").range(from, to), "schedule and presentation references"),
    loadStoragePages((from, to) => supabase.from("schedules")
      .select("id, title, status")
      .eq("church_id", churchId).order("id").range(from, to), "schedule publication status"),
    loadStoragePages((from, to) => supabase.from("presentation_sessions")
      .select("id, schedule_id, is_active").order("id").range(from, to), "active presentation status"),
    loadStoragePages((from, to) => supabase.from("songs")
      .select("id, title, source")
      .eq("church_id", churchId).order("id").range(from, to), "song references"),
  ]);

  const collectionById = new Map<string, (typeof announcementCollections)[number]>();
  for (const collection of announcementCollections) collectionById.set(collection.id, collection);
  const scheduleById = new Map<string, (typeof schedules)[number]>();
  for (const schedule of schedules) scheduleById.set(schedule.id, schedule);
  const activeScheduleIds = new Set(presentationSessions.filter((session) => session.is_active).map((session) => session.schedule_id));

  return [
    ...announcementItems.map((item) => {
      const collection = collectionById.get(item.collection_id);
      const published = collection?.is_published ? `published collection “${collection.collection_name}”` : "unpublished collection";
      return {
        label: `Announcement “${item.title}” (${published})`,
        values: [item.image_url ?? "", item.body ?? ""],
        rawPathBucket: "announcement-images",
      };
    }),
    ...scheduleItems.map((item) => {
      const schedule = scheduleById.get(item.schedule_id);
      const status = schedule?.status === "published" ? "published schedule" : "draft schedule";
      const active = activeScheduleIds.has(item.schedule_id) ? ", currently active presentation" : "";
      return {
        label: `Schedule item “${item.title}” in “${schedule?.title ?? "Unknown schedule"}” (${status}${active})`,
        values: [item.media_url ?? "", item.background_image_url ?? "", item.link_url ?? "", item.public_content ?? ""],
        rawPathBucket: "schedule-media",
      };
    }),
    ...songs.map((song) => ({
      label: `Song “${song.title}” (available in the public songbook)`,
      values: [song.source ?? ""],
    })),
  ];
}

async function getObjectUrl(file: StoredObject) {
  const bucket = createClient().storage.from(file.bucket);
  if (file.publicBucket) return bucket.getPublicUrl(file.path).data.publicUrl;
  const { data, error } = await bucket.createSignedUrl(file.path, 60);
  if (error) throw new Error(`Unable to create a temporary view link: ${error.message}`);
  if (!data?.signedUrl) throw new Error("Supabase did not return a signed URL for this private object.");
  return data.signedUrl;
}

function FileTypeIcon({ file }: { file: StoredObject }) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (isImage(file)) return <Image size={20} aria-hidden="true" />;
  if (["ppt", "pptx", "odp"].includes(extension ?? "")) return <Presentation size={20} aria-hidden="true" />;
  if (["xls", "xlsx", "ods", "csv"].includes(extension ?? "")) return <FileSpreadsheet size={20} aria-hidden="true" />;
  if (["pdf", "doc", "docx", "txt", "odt"].includes(extension ?? "")) return <FileText size={20} aria-hidden="true" />;
  if (["mp4", "mov", "webm", "m4v"].includes(extension ?? "")) return <Video size={20} aria-hidden="true" />;
  return <File size={20} aria-hidden="true" />;
}

function ObjectThumbnail({ file }: { file: StoredObject }) {
  const [url, setUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  useEffect(() => {
    let active = true;
    void getObjectUrl(file).then((nextUrl) => {
      if (active) setUrl(nextUrl);
    }).catch((error: unknown) => {
      if (active) {
        setUrl("");
        setPreviewError(getErrorMessage(error));
      }
    });
    return () => { active = false; };
  }, [file]);

  return url
    ? <img src={url} alt="" loading="lazy" onError={() => {
      setUrl("");
      setPreviewError("The preview link may have expired or access was denied.");
    }} />
    : <span className="storage-file-icon" title={previewError || "Image preview"} aria-label={previewError ? `Preview unavailable: ${previewError}` : "Image preview"}>
      <FileImage size={22} aria-hidden="true" /><small>{previewError ? "Preview unavailable" : "Image"}</small>
    </span>;
}

function StorageManagerPage() {
  const { membership } = useAuth();
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCompleteRefresh, setLastCompleteRefresh] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [query, setQuery] = useState("");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState("name-asc");
  const [page, setPage] = useState(0);
  const [deleteState, setDeleteState] = useState<DeleteDialogState | null>(null);
  const refreshPromise = useRef<Promise<void> | null>(null);
  const deleteDialogRef = useRef<HTMLElement>(null);

  const refreshInventory = useCallback(() => {
    if (refreshPromise.current) return refreshPromise.current;
    const task = (async () => {
      setRefreshing(true);
      setRefreshError("");
      setStatusMessage("");
      try {
        const supabase = createClient();
        const buckets = await loadStorageBuckets();
        const discoveredByName = new Map<string, Bucket>();
        for (const bucket of buckets) discoveredByName.set(bucket.name, bucket);
        for (const name of KNOWN_APPLICATION_BUCKETS) {
          if (!discoveredByName.has(name)) discoveredByName.set(name, { id: name, name, public: null });
        }
        const discoveredBuckets = [...discoveredByName.values()];
        const results = await Promise.all(discoveredBuckets.map(async (bucket) => {
          try {
            return await listBucketObjects(bucket);
          } catch (error) {
            return { bucket, files: [], errors: [`bucket root: ${getErrorMessage(error)}`] };
          }
        }));
        setInventory({ buckets: results, discoveryError: "" });
        if (results.every((result) => result.errors.length === 0)) setLastCompleteRefresh(new Date().toISOString());
      } catch (error) {
        const reason = getErrorMessage(error);
        setRefreshError(`Unable to discover all storage buckets: ${reason}`);
        const knownBucketResults = await Promise.all(KNOWN_APPLICATION_BUCKETS.map(async (name) => {
          const bucket = { id: name, name, public: null };
          try {
            return await listBucketObjects(bucket);
          } catch (listError) {
            return { bucket, files: [], errors: [`bucket root: ${getErrorMessage(listError)}`] };
          }
        }));
        setInventory({ buckets: knownBucketResults, discoveryError: reason });
      } finally {
        setRefreshing(false);
      }
    })();
    refreshPromise.current = task;
    void task.finally(() => {
      if (refreshPromise.current === task) {
        refreshPromise.current = null;
      }
    });
    return task;
  }, []);

  useEffect(() => {
    if (membership?.role !== "owner") return;
    let active = true;
    const onStorageChanged = () => {
      const currentRefresh = refreshPromise.current;
      if (currentRefresh) {
        void currentRefresh.then(() => {
          if (active) void refreshInventory();
        });
      } else void refreshInventory();
    };
    void refreshInventory();
    window.addEventListener("incoc:storage-changed", onStorageChanged);
    return () => {
      active = false;
      window.removeEventListener("incoc:storage-changed", onStorageChanged);
    };
  }, [membership?.role, refreshInventory]);

  useEffect(() => {
    setPage(0);
  }, [query, bucketFilter, typeFilter, sort]);

  useEffect(() => {
    if (!deleteState) return;
    const cancelButton = deleteDialogRef.current?.querySelector<HTMLButtonElement>("[data-storage-dialog-cancel]");
    cancelButton?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && deleteState.phase !== "checking" && deleteState.phase !== "deleting") {
        setDeleteState(null);
      }
      if (event.key !== "Tab") return;
      const buttons = deleteDialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deleteState]);

  const buckets = inventory?.buckets ?? [];
  const files = useMemo(() => buckets.flatMap((result) => result.files), [buckets]);
  const stats = useMemo(() => {
    return buckets.map((result) => {
      const sizes = result.files.map(getFileSize);
      return {
        ...result,
        count: result.files.length,
        totalBytes: sizes.reduce((total, size) => total + (size.bytes ?? 0), 0),
        unknownSizes: sizes.filter((size) => size.bytes === null).length,
      };
    });
  }, [buckets]);
  const totalBytes = stats.reduce((total, bucket) => total + bucket.totalBytes, 0);
  const unknownSizes = stats.reduce((total, bucket) => total + bucket.unknownSizes, 0);
  const filteredFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const visibleFiles = files.filter((file) => {
      if (bucketFilter !== "all" && file.bucket !== bucketFilter) return false;
      if (typeFilter === "images" && !isImage(file)) return false;
      if (typeFilter === "documents" && !isDocument(file)) return false;
      if (typeFilter === "other" && (isImage(file) || isDocument(file))) return false;
      return !normalizedQuery || file.name.toLocaleLowerCase().includes(normalizedQuery)
        || file.path.toLocaleLowerCase().includes(normalizedQuery)
        || file.bucket.toLocaleLowerCase().includes(normalizedQuery);
    });
    return [...visibleFiles].sort((first, second) => {
      const firstSize = getFileSize(first).bytes ?? -1;
      const secondSize = getFileSize(second).bytes ?? -1;
      const firstDate = Date.parse(first.updatedAt ?? first.createdAt ?? "") || 0;
      const secondDate = Date.parse(second.updatedAt ?? second.createdAt ?? "") || 0;
      if (sort === "name-desc") return second.name.localeCompare(first.name) || second.path.localeCompare(first.path);
      if (sort === "size-asc") return firstSize - secondSize || first.path.localeCompare(second.path);
      if (sort === "size-desc") return secondSize - firstSize || first.path.localeCompare(second.path);
      if (sort === "date-asc") return firstDate - secondDate || first.path.localeCompare(second.path);
      if (sort === "date-desc") return secondDate - firstDate || first.path.localeCompare(second.path);
      return first.name.localeCompare(second.name) || first.path.localeCompare(second.path);
    });
  }, [bucketFilter, files, query, sort, typeFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredFiles.length / FILES_PER_PAGE));
  const pageFiles = filteredFiles.slice(page * FILES_PER_PAGE, (page + 1) * FILES_PER_PAGE);
  const imageCount = files.filter(isImage).length;
  const documentCount = files.filter(isDocument).length;
  const hasBucketErrors = buckets.some((bucket) => bucket.errors.length > 0);
  const partialInventory = Boolean(inventory?.discoveryError) || hasBucketErrors;
  const knownSizedFiles = files.length - unknownSizes;

  function referencesFor(file: StoredObject, references: Reference[]) {
    const expectedUrl = getSupabasePublicConfig().url;
    if (!expectedUrl) throw new Error("The Supabase project URL is unavailable, so storage references cannot be verified.");
    const expectedOrigin = new URL(expectedUrl).origin;
    return references.filter((reference) => objectIsReferenced(file, reference, expectedOrigin));
  }

  async function checkFileReferences(file: StoredObject) {
    const churchId = membership?.churchId;
    if (!churchId || membership.role !== "owner") throw new Error("Owner access could not be verified.");
    try {
      return referencesFor(file, await loadReferences(churchId));
    } catch (error) {
      throw new Error(`Deletion is disabled because references could not be checked: ${getErrorMessage(error)}`);
    }
  }

  async function beginDelete(file: StoredObject) {
    setStatusMessage("");
    setDeleteState({ file, phase: "checking", references: [], error: "" });
    try {
      const references = await checkFileReferences(file);
      setDeleteState({ file, phase: references.length ? "referenced" : "ready", references, error: "" });
    } catch (error) {
      setDeleteState({ file, phase: "reference-error", references: [], error: getErrorMessage(error) });
    }
  }

  async function confirmDelete() {
    if (!deleteState || (deleteState.phase !== "ready" && deleteState.phase !== "delete-error")) return;
    const file = deleteState.file;
    setDeleteState({ ...deleteState, phase: "deleting", error: "" });
    try {
      const references = await checkFileReferences(file);
      if (references.length) {
        setDeleteState({ file, phase: "referenced", references, error: "" });
        return;
      }
      const { error } = await createClient().storage.from(file.bucket).remove([file.path]);
      if (error) throw new Error(error.message);
      setDeleteState(null);
      await refreshInventory();
      setStatusMessage(`Deleted “${file.path}” from ${file.bucket}.`);
    } catch (error) {
      const message = getErrorMessage(error);
      const isReferenceError = message.startsWith("Deletion is disabled");
      setDeleteState({
        file,
        phase: isReferenceError ? "reference-error" : "delete-error",
        references: [],
        error: message,
      });
    }
  }

  async function openFile(file: StoredObject) {
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setStatusMessage("Allow pop-ups to open this file.");
      return;
    }
    popup.opener = null;
    try {
      popup.location.href = await getObjectUrl(file);
    } catch (error) {
      popup.close();
      setStatusMessage(getErrorMessage(error));
    }
  }

  if (membership?.role !== "owner") {
    return <section className="storage-manager"><p className="storage-alert" role="alert">Owner access is required to manage storage.</p></section>;
  }

  return <section className="storage-manager">
    <header className="storage-header">
      <div>
        <p className="storage-eyebrow">OWNER MANAGEMENT</p>
        <h1>Storage Manager</h1>
        <p className="storage-intro">Review stored files and safely remove objects that are no longer referenced.</p>
      </div>
      <button type="button" className="storage-refresh" onClick={() => void refreshInventory()} disabled={refreshing} aria-busy={refreshing}>
        {refreshing ? <LoaderCircle size={16} className="storage-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </header>

    <nav className="storage-section-nav" aria-label="Storage Manager sections">
      <a href="#storage-overview">Overview</a>
      <a href="#storage-files">Files</a>
      <a href="#storage-buckets">Storage by bucket</a>
    </nav>

    {refreshError && <p className="storage-alert" role="alert"><AlertCircle size={17} />{refreshError}</p>}
    {statusMessage && <p className="storage-status" role="status">{statusMessage}</p>}
    {hasBucketErrors && <div className="storage-alert" role="alert">
      <AlertCircle size={17} />
      <div><strong>Some storage results are incomplete.</strong>
        <ul>{buckets.filter((bucket) => bucket.errors.length).map((bucket) => <li key={bucket.bucket.id}>
          <strong>{bucket.bucket.name}:</strong> {bucket.errors.join("; ")}
        </li>)}</ul>
      </div>
    </div>}

    <section id="storage-overview" className="storage-section" aria-labelledby="storage-overview-title">
      <div className="storage-section-title">
        <div><p className="storage-eyebrow">INVENTORY</p><h2 id="storage-overview-title">Overview</h2></div>
        <p>Last successful refresh: {lastCompleteRefresh
          ? <time dateTime={lastCompleteRefresh}>{formatDateTime(lastCompleteRefresh)}</time>
          : "No complete refresh yet"}</p>
      </div>
      {refreshing && !inventory ? <p className="storage-muted" role="status" aria-busy="true">Loading storage inventory…</p> : inventory ? <>
        <div className="storage-stat-grid">
          <article><span>Total files</span><strong>{partialInventory
            ? files.length ? `At least ${files.length.toLocaleString()}` : "Incomplete"
            : files.length.toLocaleString()}</strong></article>
          <article><span>Inventory size estimate</span><strong>{partialInventory || unknownSizes
            ? knownSizedFiles ? `At least ${formatBytes(totalBytes)}` : "Incomplete"
            : formatBytes(totalBytes)}</strong></article>
          <article><span>Images</span><strong>{partialInventory
            ? imageCount ? `At least ${imageCount.toLocaleString()}` : "Incomplete"
            : imageCount.toLocaleString()}</strong></article>
          <article><span>Documents & presentations</span><strong>{partialInventory
            ? documentCount ? `At least ${documentCount.toLocaleString()}` : "Incomplete"
            : documentCount.toLocaleString()}</strong></article>
        </div>
        <p className="storage-note">
          Inventory totals are calculated from accessible object metadata{unknownSizes ? `; ${unknownSizes} file${unknownSizes === 1 ? "" : "s"} did not report a size` : ""}.
          {partialInventory && " Counts and size are partial lower bounds because some buckets or folders could not be listed."}
          This estimate is not Supabase’s official, time-based billing usage or quota.
          {" "}<a href="https://supabase.com/dashboard/org/_/usage" target="_blank" rel="noreferrer">View Supabase Dashboard usage <ExternalLink size={12} aria-hidden="true" /></a>
        </p>
      </> : !refreshError && <p className="storage-muted">No inventory is available yet. Refresh to try again.</p>}
    </section>

    <section id="storage-files" className="storage-section" aria-labelledby="storage-files-title">
      <div className="storage-section-title">
        <div><p className="storage-eyebrow">BROWSE</p><h2 id="storage-files-title">Files</h2></div>
        <span className="storage-muted">{filteredFiles.length.toLocaleString()} matching</span>
      </div>
      <div className="storage-filters">
        <label className="storage-search"><Search size={16} aria-hidden="true" />
          <span className="sr-only">Search filename or path</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search filename or path" />
        </label>
        <label><span className="sr-only">Filter by bucket</span>
          <select value={bucketFilter} onChange={(event) => setBucketFilter(event.currentTarget.value)}>
            <option value="all">All buckets</option>
            {buckets.map(({ bucket }) => <option value={bucket.name} key={bucket.id}>{bucket.name}</option>)}
          </select>
        </label>
        <label><span className="sr-only">Filter by file type</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.currentTarget.value)}>
            <option value="all">All file types</option>
            <option value="images">Images</option>
            <option value="documents">Documents & presentations</option>
            <option value="other">Other files</option>
          </select>
        </label>
        <label><span className="sr-only">Sort files</span>
          <select value={sort} onChange={(event) => setSort(event.currentTarget.value)}>
            <option value="name-asc">Filename A–Z</option>
            <option value="name-desc">Filename Z–A</option>
            <option value="size-desc">Largest first</option>
            <option value="size-asc">Smallest first</option>
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
          </select>
        </label>
      </div>

      {refreshing && !inventory ? <p className="storage-muted" role="status" aria-busy="true">Loading files…</p>
        : pageFiles.length ? <>
          <div className="storage-file-grid">
            {pageFiles.map((file) => {
              const fileSize = getFileSize(file).bytes;
              return <article className="storage-file-card" key={`${file.bucket}:${file.path}`}>
                <div className="storage-file-preview">
                  {isImage(file) ? <ObjectThumbnail file={file} /> : <span className="storage-file-icon"><FileTypeIcon file={file} /></span>}
                </div>
                <div className="storage-file-copy">
                  <strong title={file.name}>{file.name}</strong>
                  <code title={file.path}>{file.path}</code>
                  <span>{file.bucket} · {fileSize === null ? "Size unavailable" : formatBytes(fileSize)}</span>
                  <span>{formatDate(file.updatedAt ?? file.createdAt)}</span>
                </div>
                <div className="storage-file-actions">
                  <button type="button" onClick={() => void openFile(file)} aria-label={`Open ${file.path}`}>
                    <ExternalLink size={15} aria-hidden="true" /> Open
                  </button>
                  <button type="button" className="storage-delete" onClick={() => void beginDelete(file)} disabled={Boolean(deleteState)} aria-label={`Delete ${file.path}`}>
                    <Trash2 size={15} aria-hidden="true" /> Delete
                  </button>
                </div>
              </article>;
            })}
          </div>
          {pageCount > 1 && <div className="storage-pagination">
            <button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}><ChevronLeft size={14} aria-hidden="true" /> Previous</button>
            <span>Page {page + 1} of {pageCount}</span>
            <button type="button" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page + 1 >= pageCount}>Next <ChevronRight size={14} aria-hidden="true" /></button>
          </div>}
        </>         : inventory ? <p className="storage-empty">{files.length
          ? "No files match these filters."
          : inventory.discoveryError || hasBucketErrors
            ? "No file objects were returned; one or more bucket listings are incomplete."
            : "No files were found in accessible buckets."}</p>
          : <p className="storage-muted">Refresh the inventory to browse files.</p>}
    </section>

    <section id="storage-buckets" className="storage-section" aria-labelledby="storage-buckets-title">
      <div className="storage-section-title">
        <div><p className="storage-eyebrow">BREAKDOWN</p><h2 id="storage-buckets-title">Storage by bucket</h2></div>
      </div>
      {inventory && stats.length ? <div className="storage-bucket-list">
        {stats.map((bucket) => <article className="storage-bucket-row" key={bucket.bucket.id}>
          <span className="storage-bucket-icon"><HardDrive size={19} aria-hidden="true" /></span>
          <div className="storage-bucket-copy">
            <strong>{bucket.bucket.name}</strong>
            <span>{bucket.bucket.public === null ? "Visibility unavailable" : bucket.bucket.public ? "Public bucket" : "Private bucket"} · {bucket.errors.length
              ? bucket.count ? `At least ${bucket.count.toLocaleString()} files` : "File count unavailable"
              : `${bucket.count.toLocaleString()} files`}</span>
            {bucket.errors.length > 0 && <span className="storage-bucket-error">Incomplete listing: {bucket.errors.join("; ")}</span>}
          </div>
          <strong className="storage-bucket-size">{bucket.errors.length
            ? bucket.count ? `At least ${formatBytes(bucket.totalBytes)}` : "Unavailable"
            : formatBytes(bucket.totalBytes)}{bucket.unknownSizes ? " + unknown" : ""}</strong>
        </article>)}
      </div> : inventory ? <p className="storage-empty">No buckets were discovered.</p>
        : <p className="storage-muted">Refresh the inventory to view bucket totals.</p>}
    </section>

    {deleteState && <div className="storage-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !["checking", "deleting"].includes(deleteState.phase)) setDeleteState(null);
    }}>
      <section ref={deleteDialogRef} className="storage-dialog" role="alertdialog" aria-modal="true" aria-labelledby="storage-delete-title" aria-describedby="storage-delete-description">
        <button type="button" className="storage-dialog-close" onClick={() => setDeleteState(null)} disabled={["checking", "deleting"].includes(deleteState.phase)} aria-label="Close dialog"><X size={18} /></button>
        <p className="storage-eyebrow">PERMANENT ACTION</p>
        <h2 id="storage-delete-title">Delete stored file?</h2>
        <p id="storage-delete-description">This permanently removes the object from Supabase Storage. Any content depending on this file may stop working. No database record or URL will be changed.</p>
        <dl className="storage-delete-details"><dt>Bucket</dt><dd>{deleteState.file.bucket}</dd><dt>Exact object path</dt><dd><code>{deleteState.file.path}</code></dd></dl>
        {deleteState.phase === "checking" && <p className="storage-muted" role="status" aria-busy="true"><LoaderCircle size={15} className="storage-spin" /> Checking application references…</p>}
        {deleteState.phase === "deleting" && <p className="storage-muted" role="status" aria-busy="true"><LoaderCircle size={15} className="storage-spin" /> Rechecking references and deleting…</p>}
        {deleteState.phase === "referenced" && <div className="storage-alert" role="alert">
          <AlertCircle size={17} /><div><strong>Deletion is blocked because this file is referenced.</strong>
            <ul>{deleteState.references.map((reference) => <li key={reference.label}>{reference.label}</li>)}</ul>
          </div>
        </div>}
        {deleteState.phase === "reference-error" && <p className="storage-alert" role="alert"><AlertCircle size={17} />{deleteState.error}</p>}
        {deleteState.phase === "delete-error" && <p className="storage-alert" role="alert"><AlertCircle size={17} />Storage deletion failed: {deleteState.error}</p>}
        <div className="storage-dialog-actions">
          <button type="button" data-storage-dialog-cancel onClick={() => setDeleteState(null)} disabled={["checking", "deleting"].includes(deleteState.phase)}>Cancel</button>
          <button type="button" className="storage-delete-confirm" onClick={() => void confirmDelete()} disabled={deleteState.phase !== "ready" && deleteState.phase !== "delete-error"}>
            <Trash2 size={15} aria-hidden="true" /> {deleteState.phase === "delete-error" ? "Try deletion again" : "Permanently delete"}
          </button>
        </div>
      </section>
    </div>}
  </section>;
}

export { StorageManagerPage };
