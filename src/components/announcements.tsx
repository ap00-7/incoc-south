import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ImagePlus,
  MonitorPlay,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { ConfirmationDialog } from "@/components/confirm-button";
import {
  deleteAnnouncementItem,
  moveAnnouncementItem,
  saveAnnouncementCollection,
  saveAnnouncementItem,
} from "@/lib/actions/content";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/spa/auth-provider";

const announcementBucket = "announcement-images";
const maxAnnouncementImageSize = 50 * 1024 * 1024;
const maxAnnouncementImagePixels = 60_000_000;

type AnnouncementItem = {
  id: string;
  title: string;
  image_url: string | null;
  body: string;
  position: number;
  updated_at: string;
};

type AnnouncementData = {
  churchId: string;
  collectionName: string;
  items: AnnouncementItem[];
};

type AnnouncementDraft = {
  id?: string;
  expected_updated_at?: string;
  title: string;
  image_url: string;
  body: string;
};

type PreparedImage = {
  file: File;
  contentType: string;
  extension: string;
};

function readAscii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function imageMimeFromSignature(bytes: Uint8Array, fileType: string) {
  if (bytes[0] === 0x89 && readAscii(bytes, 1, 3) === "PNG") return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (readAscii(bytes, 0, 3) === "GIF") return "image/gif";
  if (readAscii(bytes, 0, 2) === "BM") return "image/bmp";
  if ((readAscii(bytes, 0, 2) === "II" && bytes[2] === 0x2a && bytes[3] === 0)
    || (readAscii(bytes, 0, 2) === "MM" && bytes[2] === 0 && bytes[3] === 0x2a)) return "image/tiff";
  if (readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (readAscii(bytes, 4, 4) === "ftyp") {
    const brands = readAscii(bytes, 8, 16);
    if (/\b(?:avif|avis)\b/.test(brands)) return "image/avif";
    if (/\b(?:heic|heix|hevc|hevx)\b/.test(brands)) return "image/heic";
    if (/\b(?:heif|mif1|msf1)\b/.test(brands)) return "image/heif";
  }
  if (fileType.startsWith("image/") && fileType !== "image/svg+xml") return fileType;
  return null;
}

async function prepareAnnouncementImage(file: File): Promise<PreparedImage> {
  if (file.size > maxAnnouncementImageSize) throw new Error("Choose an image smaller than 50 MB.");
  if (file.type === "image/svg+xml" || /\.svgz?$/i.test(file.name)) {
    throw new Error("SVG files are not accepted because public vector uploads can contain active content. Use a raster image instead.");
  }
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const contentType = imageMimeFromSignature(bytes, file.type);
  if (!contentType) throw new Error("This file could not be verified as an image.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([file], { type: contentType }));
  } catch {
    throw new Error("This image format cannot be previewed by this browser. Convert it to PNG, JPEG, WebP, or GIF and try again.");
  }
  if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > maxAnnouncementImagePixels) {
    bitmap.close();
    throw new Error("This image is too large to preview safely.");
  }

  if (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(contentType)) {
    bitmap.close();
    return { file, contentType, extension: contentType.split("/")[1].replace("jpeg", "jpg") };
  }

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("This image could not be prepared for safe browser display.");
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("This image could not be converted to a browser-safe format."));
    }, "image/png");
  });
  if (png.size > maxAnnouncementImageSize) throw new Error("The converted image is larger than 50 MB.");
  return {
    file: new File([png], `${file.name.replace(/\.[^.]+$/, "") || "announcement"}.png`, { type: "image/png" }),
    contentType: "image/png",
    extension: "png",
  };
}

function useAnnouncementData() {
  const [data, setData] = useState<AnnouncementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void (async () => {
      const supabase = createClient();
      const { data: church, error: churchError } = await supabase.from("churches")
        .select("id").eq("slug", "incoc-south").maybeSingle();
      if (churchError) throw new Error(`Unable to identify INCOC South: ${churchError.message}`);
      if (!church) throw new Error("The INCOC South church record is unavailable.");
      const [collectionResult, itemsResult] = await Promise.all([
        supabase.from("announcement_collections").select("collection_name")
          .eq("church_id", church.id).maybeSingle(),
        supabase.from("announcement_items").select("id, title, image_url, body, position, updated_at")
          .eq("church_id", church.id).order("position").order("created_at"),
      ]);
      if (collectionResult.error) throw new Error(`Unable to load the announcement collection: ${collectionResult.error.message}`);
      if (itemsResult.error) throw new Error(`Unable to load announcements: ${itemsResult.error.message}`);
      if (active) {
        setData({
          churchId: church.id,
          collectionName: collectionResult.data?.collection_name ?? "South Region",
          items: itemsResult.data ?? [],
        });
      }
    })().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load announcements.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [revision]);

  return { data, loading, error, reload };
}

function AnnouncementItemEditor({
  draft,
  churchId,
  onClose,
  onSave,
  onSaved,
}: {
  draft: AnnouncementDraft;
  churchId: string;
  onClose: () => void;
  onSave: (draft: AnnouncementDraft) => Promise<string | null>;
  onSaved: (notice: string | null) => Promise<void>;
}) {
  const [value, setValue] = useState(draft);
  const [selectedImage, setSelectedImage] = useState<PreparedImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [imageError, setImageError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedImage) {
      setPreviewUrl(value.image_url);
      return;
    }
    const objectUrl = URL.createObjectURL(selectedImage.file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedImage, value.image_url]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  async function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setImageError("");
    try {
      setSelectedImage(await prepareAnnouncementImage(file));
    } catch (validationError) {
      setImageError(validationError instanceof Error ? validationError.message : "This image could not be validated.");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    let imageUrl = value.image_url;
    let uploadedPath: string | null = null;
    try {
      if (selectedImage) {
        uploadedPath = `${churchId}/${crypto.randomUUID()}.${selectedImage.extension}`;
        const { error: uploadError } = await createClient().storage.from(announcementBucket).upload(uploadedPath, selectedImage.file, {
          cacheControl: "3600",
          contentType: selectedImage.contentType,
          upsert: false,
        });
        if (uploadError) throw new Error(`Unable to upload the announcement image: ${uploadError.message}`);
        imageUrl = createClient().storage.from(announcementBucket).getPublicUrl(uploadedPath).data.publicUrl;
      }
      const notice = await onSave({
        ...(value.id ? { id: value.id, expected_updated_at: value.expected_updated_at } : {}),
        title: value.title,
        body: value.body,
        image_url: imageUrl,
      });
      uploadedPath = null;
      await onSaved(notice);
    } catch (saveError) {
      if (uploadedPath) {
        const { error: cleanupError } = await createClient().storage.from(announcementBucket).remove([uploadedPath]);
        if (cleanupError) {
          setError(`${saveError instanceof Error ? saveError.message : "Unable to save the announcement."} The newly uploaded image could not be cleaned up: ${cleanupError.message}`);
          setSaving(false);
          return;
        }
      }
      setError(saveError instanceof Error ? saveError.message : "Unable to save the announcement.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="announcement-dialog-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !saving) onClose();
  }}>
    <section className="announcement-dialog" role="dialog" aria-modal="true" aria-labelledby="announcement-editor-title">
      <header className="announcement-dialog-header">
        <div><p className="eyebrow">ANNOUNCEMENT</p><h2 id="announcement-editor-title">{value.id ? "Edit item" : "Add item"}</h2></div>
        <button type="button" className="icon-button" aria-label="Close editor" onClick={onClose} disabled={saving}><X size={18} /></button>
      </header>
      <form className="announcement-editor-form" onSubmit={(event) => void save(event)}>
        <label htmlFor="announcement-title">Title</label>
        <input id="announcement-title" value={value.title} maxLength={200} required onChange={(event) => setValue({ ...value, title: event.target.value })} />
        <label htmlFor="announcement-image-file">Image</label>
        <div className="announcement-image-picker">
          {previewUrl
            ? <img className="announcement-image-preview" src={previewUrl} alt="Announcement image preview" />
            : <div className="announcement-image-empty"><ImagePlus size={25} /><span>Image optional</span></div>}
          <div className="announcement-image-actions">
            <input id="announcement-image-file" ref={fileInput} className="sr-only" type="file" accept="image/*" onChange={(event) => void selectImage(event)} />
            <button type="button" className="button button-secondary" onClick={() => fileInput.current?.click()} disabled={saving}>
              <ImagePlus size={15} /> {previewUrl ? "Replace image" : "Choose image"}
            </button>
            {previewUrl && <button type="button" className="button button-secondary" onClick={() => {
              setSelectedImage(null);
              setValue({ ...value, image_url: "" });
              setImageError("");
            }} disabled={saving}>Remove image</button>}
          </div>
        </div>
        {imageError && <p className="form-error" role="alert">{imageError}</p>}
        <label htmlFor="announcement-body">Body</label>
        <textarea id="announcement-body" value={value.body} maxLength={10000} rows={9} onChange={(event) => setValue({ ...value, body: event.target.value })} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="announcement-editor-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={saving} aria-busy={saving}>{saving ? "Saving…" : "Save item"}</button>
        </div>
      </form>
    </section>
  </div>;
}

export function AnnouncementManagerPage() {
  const { membership } = useAuth();
  const { data, loading, error, reload } = useAnnouncementData();
  const isOwner = membership?.role === "owner" && membership.churchId === data?.churchId;
  const [collectionName, setCollectionName] = useState("South Region");
  const [savingCollection, setSavingCollection] = useState(false);
  const [draft, setDraft] = useState<AnnouncementDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementItem | null>(null);
  const [pendingAction, setPendingAction] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (data) setCollectionName(data.collectionName);
  }, [data]);

  async function saveCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || savingCollection) return;
    setSavingCollection(true);
    setActionError("");
    try {
      await saveAnnouncementCollection({ collection_name: collectionName });
      setFeedback("Collection name saved.");
      reload();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : "Unable to save the collection name.");
    } finally {
      setSavingCollection(false);
    }
  }

  async function saveItem(value: AnnouncementDraft): Promise<string | null> {
    if (!data) throw new Error("Announcement data is unavailable. Reload and try again.");
    return saveAnnouncementItem({
      ...(value.id ? { id: value.id, expected_updated_at: value.expected_updated_at } : {}),
      title: value.title,
      image_url: value.image_url,
      body: value.body,
    });
  }

  async function reorder(item: AnnouncementItem, direction: -1 | 1) {
    if (pendingAction) return;
    setPendingAction(true);
    setActionError("");
    try {
      await moveAnnouncementItem({ id: item.id, direction });
      reload();
    } catch (moveError) {
      setActionError(moveError instanceof Error ? moveError.message : "Unable to reorder the announcement.");
      reload();
    } finally {
      setPendingAction(false);
    }
  }

  async function removeItem() {
    if (!deleteTarget || pendingAction) return;
    setPendingAction(true);
    setActionError("");
    setDeleteError("");
    try {
      const notice = await deleteAnnouncementItem({ id: deleteTarget.id });
      setDeleteTarget(null);
      setFeedback(notice ?? "Announcement deleted.");
      reload();
    } catch (deleteError) {
      setDeleteError(deleteError instanceof Error ? deleteError.message : "Unable to delete the announcement.");
      reload();
    } finally {
      setPendingAction(false);
    }
  }

  return <section className="announcement-manager content-wrap">
    <header className="announcement-manager-header">
      <div>
        <p className="eyebrow">ANNOUNCEMENTS</p>
        <h1 className="detail-title">{collectionName || "South Region"}</h1>
      </div>
      <Link className="button button-secondary" to="/announcement/slides"><MonitorPlay size={16} /> View slides</Link>
    </header>
    {isOwner && <form className="announcement-collection-form" onSubmit={(event) => void saveCollection(event)}>
      <label htmlFor="announcement-collection-name">Collection name</label>
      <input id="announcement-collection-name" value={collectionName} maxLength={120} required onChange={(event) => setCollectionName(event.target.value)} />
      <button type="submit" className="button button-secondary" disabled={savingCollection} aria-busy={savingCollection}>{savingCollection ? "Saving…" : "Save name"}</button>
    </form>}
    {feedback && <p className="announcement-feedback" role="status">{feedback}</p>}
    {actionError && <p className="form-error" role="alert">{actionError}</p>}
    {loading && <p className="muted" role="status">Loading announcements…</p>}
    {error && <p className="notice notice-warning" role="alert">{error} <button type="button" className="text-link" onClick={reload}>Try again</button></p>}
    {!loading && !error && <>
      {isOwner && <button type="button" className="button button-primary announcement-add-button" onClick={() => setDraft({ title: "", image_url: "", body: "" })}>
        <Plus size={16} /> Add item
      </button>}
      {data?.items.length
        ? <ol className="announcement-list">
          {data.items.map((item, index) => <li className="announcement-list-item" key={item.id}>
            {item.image_url
              ? <img className="announcement-thumbnail" src={item.image_url} alt="" />
              : <div className="announcement-thumbnail announcement-thumbnail-empty"><ImagePlus size={20} /></div>}
            <div className="announcement-list-copy">
              <strong>{item.title.trim() || "Untitled announcement"}</strong>
              <span>{item.body.trim() || "No body text"}</span>
            </div>
            {isOwner && <div className="announcement-list-actions">
              <button type="button" className="icon-button" title="Move up" aria-label={`Move ${item.title || "announcement"} up`} disabled={index === 0 || pendingAction} onClick={() => void reorder(item, -1)}><ArrowUp size={16} /></button>
              <button type="button" className="icon-button" title="Move down" aria-label={`Move ${item.title || "announcement"} down`} disabled={index === data.items.length - 1 || pendingAction} onClick={() => void reorder(item, 1)}><ArrowDown size={16} /></button>
              <button type="button" className="icon-button" title="Edit" aria-label={`Edit ${item.title || "announcement"}`} onClick={() => setDraft({
                id: item.id,
                expected_updated_at: item.updated_at,
                title: item.title,
                image_url: item.image_url ?? "",
                body: item.body,
              })}><Pencil size={16} /></button>
              <button type="button" className="icon-button danger" title="Delete" aria-label={`Delete ${item.title || "announcement"}`} onClick={() => setDeleteTarget(item)}><Trash2 size={16} /></button>
            </div>}
          </li>)}
        </ol>
        : <div className="empty-state announcement-empty">There are no announcements yet.</div>}
    </>}
    {draft && data && <AnnouncementItemEditor
      key={draft.id ?? "new"}
      draft={draft}
      churchId={data.churchId}
      onClose={() => setDraft(null)}
      onSave={saveItem}
      onSaved={async (notice) => {
        setDraft(null);
        setFeedback(notice ?? (draft.id ? "Announcement updated." : "Announcement added."));
        reload();
      }}
    />}
    {deleteTarget && <ConfirmationDialog
      title="Delete announcement?"
      description={`Delete "${deleteTarget.title || "Untitled announcement"}"? This cannot be undone.`}
      pending={pendingAction}
      error={deleteError}
      onCancel={() => { if (!pendingAction) { setDeleteTarget(null); setDeleteError(""); } }}
      onConfirm={() => void removeItem()}
    />}
  </section>;
}

function AnnouncementSlide({ item }: { item: AnnouncementItem }) {
  return <article className={`announcement-slide${item.image_url && item.body.trim() ? " announcement-slide-split" : ""}`}>
    {item.title.trim() && <h1>{item.title}</h1>}
    <div className="announcement-slide-content">
      {item.image_url && <img src={item.image_url} alt="" />}
      {item.body.trim() && <p>{item.body}</p>}
      {!item.image_url && !item.body.trim() && <p className="announcement-slide-empty">No announcement content.</p>}
    </div>
  </article>;
}

export function AnnouncementSlidesPage() {
  const { data, loading, error, reload } = useAnnouncementData();
  const [index, setIndex] = useState(0);
  const pointerStart = useRef<{ id: number; x: number; y: number } | null>(null);
  const items = data?.items ?? [];
  const currentIndex = Math.min(index, Math.max(items.length - 1, 0));
  const currentItem = items[currentIndex];
  const move = useCallback((direction: -1 | 1) => {
    setIndex((current) => Math.min(Math.max(current + direction, 0), Math.max(items.length - 1, 0)));
  }, [items.length]);

  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(items.length - 1, 0)));
  }, [items.length]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true], a")) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        move(1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move]);

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, a, input, textarea, select, [contenteditable=true]")) return;
    pointerStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || start.id !== event.pointerId) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
    move(deltaX < 0 ? 1 : -1);
  }

  return <section
    className="announcement-projector"
    aria-label="Announcement slides"
    onPointerDown={onPointerDown}
    onPointerUp={onPointerUp}
    onPointerCancel={() => { pointerStart.current = null; }}
    onLostPointerCapture={() => { pointerStart.current = null; }}
  >
    <Link className="announcement-projector-back" to="/announcement" aria-label="Back to announcements"><ArrowLeft size={17} /> Announcements</Link>
    {loading
      ? <p className="announcement-projector-message" role="status">Loading announcements…</p>
      : error
        ? <p className="announcement-projector-message" role="alert">{error} <button type="button" className="text-link" onClick={reload}>Try again</button></p>
        : currentItem
          ? <>
            <section className="announcement-slide-frame" aria-live="polite">
              <AnnouncementSlide item={currentItem} />
            </section>
            <nav className="announcement-slide-controls" aria-label="Announcement navigation">
              <button type="button" onClick={() => move(-1)} disabled={currentIndex === 0} aria-label="Previous announcement"><ArrowLeft size={22} /></button>
              <span aria-live="polite">{currentIndex + 1} / {items.length}</span>
              <button type="button" onClick={() => move(1)} disabled={currentIndex >= items.length - 1} aria-label="Next announcement"><ArrowRight size={22} /></button>
            </nav>
          </>
          : <p className="announcement-projector-message">There are no announcements to display.</p>}
  </section>;
}
