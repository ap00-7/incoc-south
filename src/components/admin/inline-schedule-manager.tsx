"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Film,
  ImagePlus,
  Link2,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  createSchedule,
  deleteSchedule,
  deleteScheduleItem,
  duplicateScheduleItem,
  moveScheduleItem,
  saveScheduleItem,
  updateSchedule,
  type ScheduleItemInput,
} from "@/app/admin/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { useServerFormAction } from "@/components/use-server-form-action";
import { createClient } from "@/lib/supabase/browser";

type SongOption = { id: string; title: string; language: string };
type TranslationLanguage = ScheduleItemInput["translation_language"];
type ScheduleItem = {
  id: string;
  item_type: string;
  title: string;
  position: number;
  leader_name: string | null;
  translator_name: string | null;
  translation_language: string | null;
  duration_minutes: number | null;
  public_content: string | null;
  link_title: string | null;
  link_url: string | null;
  media_url: string | null;
  background_image_url: string | null;
  song_id: string | null;
  updated_at: string;
  song: { title: string } | { title: string }[] | null;
  notes?: string;
};

const itemTitles = [
  ["Opening", "song"],
  ["Pre-service meeting", "other"],
  ["Welcome and Prayer", "welcome"],
  ["Announcements", "announcement"],
  ["Worship", "song"],
  ["Sermon and Communion", "sermon"],
  ["Communion Song", "song"],
  ["Contribution Song", "song"],
  ["Closing Prayer", "closing"],
  ["Closing Song", "song"],
] as const;
function itemTypeForTitle(title: string, fallback: string) {
  return itemTitles.find(([option]) => option === title)?.[1] ?? fallback;
}

const mediaTypes: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};
const maxMediaSize = 50 * 1024 * 1024;

type Draft = {
  id?: string;
  tempId: string;
  expectedUpdatedAt?: string;
  item_type: string;
  title: string;
  song_id: string;
  duration_minutes: string;
  leader_name: string;
  translator_name: string;
  translation_language: TranslationLanguage;
  link_title: string;
  link_url: string;
  public_content: string;
  notes: string;
  media_url: string;
  background_image_url: string;
};

function emptyDraft(itemType: string): Draft {
  return {
    tempId: crypto.randomUUID(),
    item_type: itemType,
    title: itemType === "song" ? "Communion Song" : "",
    song_id: "",
    duration_minutes: "",
    leader_name: "",
    translator_name: "",
    translation_language: "",
    link_title: "",
    link_url: "",
    public_content: "",
    notes: "",
    media_url: "",
    background_image_url: "",
  };
}

function draftFromItem(item: ScheduleItem): Draft {
  return {
    id: item.id,
    tempId: item.id,
    expectedUpdatedAt: item.updated_at,
    item_type: itemTypeForTitle(item.title, item.item_type),
    title: item.title,
    song_id: item.song_id ?? "",
    duration_minutes: item.duration_minutes?.toString() ?? "",
    leader_name: item.leader_name ?? "",
    translator_name: item.translator_name ?? "",
    translation_language: item.translation_language === "Kannada" || item.translation_language === "Tamil" || item.translation_language === "English"
      ? item.translation_language
      : "",
    link_title: item.link_title ?? "",
    link_url: item.link_url ?? "",
    public_content: item.public_content ?? "",
    notes: item.notes ?? "",
    media_url: item.media_url ?? "",
    background_image_url: item.background_image_url ?? "",
  };
}

export function InlineScheduleManager({
  schedule,
  items,
  songs,
  returnTo,
  churchId,
}: {
  schedule: {
    id: string;
    title: string;
    service_date: string;
    venue: string | null;
    description: string | null;
    updated_at: string;
  };
  items: ScheduleItem[];
  songs: SongOption[];
  returnTo: string;
  churchId: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<File | null>(null);
  const [selectedBackground, setSelectedBackground] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [mediaValidation, setMediaValidation] = useState("");
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  function openAdd(itemType = "other") {
    setDraft(emptyDraft(itemType));
    setSelectedMedia(null);
    setSelectedBackground(null);
    setError("");
    setMediaValidation("");
  }

  function openEdit(item: ScheduleItem) {
    setDraft(draftFromItem(item));
    setSelectedMedia(null);
    setSelectedBackground(null);
    setError("");
    setMediaValidation("");
  }

  const closeModal = useCallback(() => {
    if (saving) return;
    setDraft(null);
    setSelectedMedia(null);
    setSelectedBackground(null);
    setError("");
    setMediaValidation("");
  }, [saving]);

  async function uploadMedia(file: File, itemKey: string, kind: "media" | "background") {
    const supabase = createClient();
    const extension = mediaTypes[file.type];
    if (!extension) throw new Error("This media format is not supported.");
    const path = `${churchId}/${schedule.id}/${itemKey}/${kind}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("schedule-media").upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) throw new Error(`Unable to upload ${kind === "background" ? "background image" : "media"}: ${uploadError.message}`);
    return supabase.storage.from("schedule-media").getPublicUrl(path).data.publicUrl;
  }

  useEffect(() => {
    if (!draft) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) closeModal();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeModal, draft, saving]);

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    if (mediaValidation) {
      setError(mediaValidation);
      return;
    }
    if (draft.item_type === "song" && !draft.song_id && !draft.id) {
      setError("Select a song from the church Songbook.");
      return;
    }
    setSaving(true);
    setUploading(Boolean(selectedMedia || selectedBackground));
    setError("");
    try {
      let mediaUrl = draft.media_url;
      let backgroundImageUrl = draft.background_image_url;
      if (selectedMedia) {
        mediaUrl = await uploadMedia(selectedMedia, draft.tempId, "media");
        setDraft((current) => current ? { ...current, media_url: mediaUrl } : current);
        setSelectedMedia(null);
      }
      if (selectedBackground) {
        backgroundImageUrl = await uploadMedia(selectedBackground, draft.tempId, "background");
        setDraft((current) => current ? { ...current, background_image_url: backgroundImageUrl } : current);
        setSelectedBackground(null);
      }
      setUploading(false);
      const result = await saveScheduleItem({
        schedule_id: schedule.id,
        ...(draft.id ? { item_id: draft.id, expected_updated_at: draft.expectedUpdatedAt } : {}),
        item_type: draft.item_type as ScheduleItemInput["item_type"],
        title: draft.title,
        song_id: draft.song_id,
        duration_minutes: draft.duration_minutes,
        leader_name: draft.leader_name,
        translator_name: draft.translator_name,
        translation_language: draft.translation_language,
        link_title: draft.link_title,
        link_url: draft.link_url,
        public_content: draft.public_content,
        notes: draft.notes,
        media_url: mediaUrl,
        background_image_url: backgroundImageUrl,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setFeedback(result.message);
      setDraft(null);
      setSelectedMedia(null);
      setSelectedBackground(null);
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The item could not be saved.");
    } finally {
      setUploading(false);
      setSaving(false);
    }
  }

  async function duplicateItem(item: ScheduleItem) {
    if (duplicatingId) return;
    setDuplicatingId(item.id);
    setFeedback("");
    try {
      const result = await duplicateScheduleItem({ schedule_id: schedule.id, item_id: item.id });
      if (!result.ok) {
        setFeedback(result.message);
        return;
      }
      setFeedback(result.message);
      router.refresh();
    } catch (duplicateError) {
      setFeedback(duplicateError instanceof Error ? duplicateError.message : "Unable to duplicate this item.");
    } finally {
      setDuplicatingId(null);
    }
  }

  return (
    <section className="inline-owner-editor">
      <div className="inline-item-toolbar">
        <button className="button button-primary" type="button" onClick={() => openAdd()}>
          <Plus size={15} /> Add Item
        </button>
        <button className="button button-secondary" type="button" onClick={() => openAdd("song")}>
          <Plus size={15} /> Add Song
        </button>
      </div>
      {feedback && <p className="inline-item-feedback" role="status">{feedback}</p>}
      {items.length ? <ol className="inline-programme-list">
        {items.map((item, index) => {
          const relatedSong = Array.isArray(item.song) ? item.song[0] : item.song;
          return <li className="inline-programme-item" key={item.id}>
            <div className="inline-programme-actions">
              <div>
                <strong>{item.title}</strong>
                {relatedSong && <p className="muted">{relatedSong.title}</p>}
              </div>
              <div className="mini-actions">
                <button className="icon-button" type="button" aria-label="Edit item" onClick={() => openEdit(item)}>Edit</button>
                <button className="icon-button" type="button" aria-label={`Duplicate ${item.title}`} onClick={() => void duplicateItem(item)} disabled={duplicatingId !== null}>{duplicatingId === item.id ? "Duplicating…" : "Duplicate"}</button>
                <form action={moveScheduleItem}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="direction" value="-1" />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <PendingSubmitButton className="icon-button" ariaLabel="Move item up" pendingLabel="Moving…" disabled={index === 0}><ArrowUp size={15} /></PendingSubmitButton>
                </form>
                <form action={moveScheduleItem}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="direction" value="1" />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <PendingSubmitButton className="icon-button" ariaLabel="Move item down" pendingLabel="Moving…" disabled={index === items.length - 1}><ArrowDown size={15} /></PendingSubmitButton>
                </form>
                <form>
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <ConfirmButton
                    action={deleteScheduleItem}
                    title="Delete schedule item?"
                    message={`Delete “${item.title}” from this schedule? The selected Songbook entry will remain.`}
                    className="icon-button danger"
                  ><Trash2 size={15} /></ConfirmButton>
                </form>
              </div>
            </div>
          </li>;
        })}
      </ol> : <p className="muted">No schedule items yet.</p>}

      {draft && <div className="item-modal-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}>
        <section className="item-modal" role="dialog" aria-modal="true" aria-labelledby="item-modal-title">
          <header className="item-modal-header">
            <div><p className="eyebrow">SCHEDULE ITEM</p><h2 id="item-modal-title">{draft.id ? "Edit item" : "Add item"}</h2></div>
            <button type="button" className="icon-button" aria-label="Close" onClick={closeModal}><X size={19} /></button>
          </header>
          <form className="item-modal-form" onSubmit={(event) => void saveItem(event)}>
            <label htmlFor="schedule-item-title">Title <span aria-hidden="true">*</span></label>
            <select
              id="schedule-item-title"
              value={draft.title}
              required
              onChange={(event) => {
                const title = event.target.value;
                const itemType = itemTypeForTitle(title, draft.item_type);
                setDraft({ ...draft, title, item_type: itemType });
              }}
              autoFocus
            >
              {!draft.title && <option value="" disabled>Select a title</option>}
              {draft.title && !itemTitles.some(([title]) => title === draft.title) && <option value={draft.title}>{draft.title} (existing)</option>}
              {itemTitles.map(([title]) => <option key={title} value={title}>{title}</option>)}
            </select>

            {draft.item_type === "song" && <SongPicker
              songs={songs}
              value={draft.song_id}
              onChange={(songId) => setDraft({ ...draft, song_id: songId })}
              onCreate={() => window.open("/song?create=1", "_blank", "noopener,noreferrer")}
            />}

            {draft.item_type !== "song" && <>
              <label htmlFor="schedule-item-duration">Duration <span className="muted">(minutes)</span></label>
              <input id="schedule-item-duration" type="number" min="0" max="1440" step="1" value={draft.duration_minutes} onChange={(event) => setDraft({ ...draft, duration_minutes: event.target.value })} />
            </>}

            <label htmlFor="schedule-item-leader">{draft.item_type === "song" ? "Song leader" : "Responsible"}</label>
            <input id="schedule-item-leader" value={draft.leader_name} maxLength={200} onChange={(event) => setDraft({ ...draft, leader_name: event.target.value })} />

            {draft.item_type !== "song" && <>
              <label htmlFor="schedule-item-translator">Translator</label>
              <input id="schedule-item-translator" value={draft.translator_name} maxLength={200} onChange={(event) => setDraft({ ...draft, translator_name: event.target.value })} />
              <label htmlFor="schedule-item-language">Translation in</label>
              <select id="schedule-item-language" value={draft.translation_language} onChange={(event) => {
                const language = event.target.value;
                setDraft({ ...draft, translation_language: language === "Kannada" || language === "Tamil" || language === "English" ? language : "" });
              }}>
                <option value="">Select a language</option>
                <option value="Kannada">Kannada</option>
                <option value="Tamil">Tamil</option>
                <option value="English">English</option>
              </select>
              <fieldset className="item-link-fields">
                <legend><Link2 size={14} /> URL</legend>
                <label htmlFor="schedule-item-link-title">Link Title</label>
                <input id="schedule-item-link-title" value={draft.link_title} maxLength={200} onChange={(event) => setDraft({ ...draft, link_title: event.target.value })} />
                <label htmlFor="schedule-item-link">Link</label>
                <input id="schedule-item-link" type="url" value={draft.link_url} maxLength={2048} onChange={(event) => setDraft({ ...draft, link_url: event.target.value })} />
              </fieldset>
            </>}

            {draft.item_type === "song" && <MediaPicker
              label="Background Image"
              value={draft.background_image_url}
              file={selectedBackground}
              imageOnly
              onValue={(background_image_url) => setDraft({ ...draft, background_image_url })}
              onFile={setSelectedBackground}
              onValidation={setMediaValidation}
            />}

            {draft.item_type !== "song" && <MediaPicker
              label="Media"
              value={draft.media_url}
              file={selectedMedia}
              onValue={(media_url) => setDraft({ ...draft, media_url })}
              onFile={setSelectedMedia}
              onValidation={setMediaValidation}
            />}

            {draft.item_type !== "song" && <>
              <label htmlFor="schedule-item-content">Display content <span className="muted">(optional)</span></label>
              <textarea id="schedule-item-content" rows={3} maxLength={5000} value={draft.public_content} onChange={(event) => setDraft({ ...draft, public_content: event.target.value })} />
            </>}
            <label htmlFor="schedule-item-notes">Internal note <span className="muted">(owners only)</span></label>
            <textarea id="schedule-item-notes" rows={2} maxLength={2000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />

            {error && <p className="item-modal-error" role="alert">{error}</p>}
            <footer className="item-modal-footer">
              <button type="button" className="button button-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
              <button type="submit" className="button button-primary" disabled={saving} aria-busy={saving}>{saving && <LoaderCircle size={15} className="button-spinner" aria-hidden="true" />}{uploading ? "Uploading…" : saving ? "Saving…" : "Save"}</button>
            </footer>
          </form>
        </section>
      </div>}
    </section>
  );
}

function SongPicker({
  songs,
  value,
  onChange,
  onCreate,
}: {
  songs: SongOption[];
  value: string;
  onChange: (id: string) => void;
  onCreate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const selected = songs.find((song) => song.id === value);
  const filtered = songs.filter((song) => `${song.title} ${song.language}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="song-picker">
      <label>Song</label>
      <div className="song-picker-row">
        <FileText size={18} aria-hidden="true" />
        <button type="button" className="song-picker-select" aria-expanded={open} onClick={() => { setOpen(!open); setMenuOpen(false); }}>
          {selected ? `${selected.title} · ${selected.language}` : "Select a Songbook song"}
        </button>
        <div className="song-picker-menu">
          <button type="button" className="icon-button" aria-label="Song options" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><MoreHorizontal size={18} /></button>
          {menuOpen && <div className="song-picker-menu-popover">
            <button type="button" disabled={!selected} onClick={() => { onChange(""); setMenuOpen(false); }}>Clear</button>
            <button type="button" onClick={() => { setOpen(true); setMenuOpen(false); }}>Replace</button>
            {selected
              ? <Link href={`/song/${selected.id}`} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>Open in new tab</Link>
              : <button type="button" onClick={() => { onCreate(); setMenuOpen(false); }}>Create in Songbook</button>}
          </div>}
        </div>
      </div>
      {open && <div className="song-picker-dropdown">
        <label className="song-picker-search"><Search size={15} /><input type="search" value={query} placeholder="Search songs" autoFocus onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="song-picker-results">
          {filtered.map((song) => <button type="button" key={song.id} onClick={() => { onChange(song.id); setOpen(false); setQuery(""); }}>
            <FileText size={16} /><span>{song.title}<small>{song.language}</small></span>
          </button>)}
          {!filtered.length && <p>No matching songs.</p>}
        </div>
        <button type="button" className="song-picker-create" onClick={onCreate}><Plus size={15} /> Create a song in Songbook</button>
        <button type="button" className="song-picker-close" onClick={() => setOpen(false)}>Close selector</button>
      </div>}
    </div>
  );
}

function MediaPicker({
  label,
  value,
  file,
  imageOnly = false,
  onValue,
  onFile,
  onValidation,
}: {
  label: string;
  value: string;
  file: File | null;
  imageOnly?: boolean;
  onValue: (url: string) => void;
  onFile: (file: File | null) => void;
  onValidation: (message: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [validation, setValidation] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const localPreviewRef = useRef<string | null>(null);
  const previewUrl = localPreview ?? value;
  useEffect(() => () => {
    if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
  }, []);

  function selectFile(selected: File | undefined) {
    if (!selected) return;
    const supported = Boolean(mediaTypes[selected.type]) && (!imageOnly || selected.type.startsWith("image/"));
    if (!supported) {
      const message = imageOnly ? "Choose a PNG, JPG, WebP, or GIF image." : "Choose a PNG, JPG, WebP, GIF, MP4, or WebM file.";
      setValidation(message);
      onValidation(message);
      return;
    }
    if (selected.size > maxMediaSize) {
      setValidation("Files must be 50 MB or smaller.");
      onValidation("Files must be 50 MB or smaller.");
      return;
    }
    setValidation("");
    onValidation("");
    if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    const objectUrl = URL.createObjectURL(selected);
    localPreviewRef.current = objectUrl;
    setLocalPreview(objectUrl);
    onFile(selected);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files[0]);
  }

  const isVideo = file?.type.startsWith("video/") || (!file && /\.(mp4|webm)(?:$|\?)/i.test(value));
  return (
    <div className="media-picker">
      <label>{label}</label>
      <div
        className={`media-drop-zone${dragging ? " is-dragging" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={fileInput}
          type="file"
          hidden
          accept={imageOnly ? "image/png,image/jpeg,image/webp,image/gif" : "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"}
          onChange={onInputChange}
        />
        {previewUrl ? <div className="media-preview">
          {isVideo
            ? <video src={previewUrl} controls preload="metadata" />
            : <img src={previewUrl} alt={`${label} preview`} />}
          <div className="media-preview-actions">
            <button type="button" onClick={() => fileInput.current?.click()}>Replace file</button>
            <button type="button" onClick={() => {
              if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
              localPreviewRef.current = null;
              setLocalPreview(null);
              onFile(null);
              onValue("");
              onValidation("");
            }}>Remove</button>
          </div>
        </div> : <button type="button" className="media-pick-button" onClick={() => fileInput.current?.click()}>
          {imageOnly ? <ImagePlus size={20} /> : <Film size={20} />}
          <span>Select or drop a file</span>
          <small>{imageOnly ? "PNG, JPG, WebP, GIF · up to 50 MB" : "PNG, JPG, WebP, GIF, MP4, WebM · up to 50 MB"}</small>
        </button>}
      </div>
      {validation && <p className="item-modal-error" role="alert">{validation}</p>}
      {file && <p className="media-file-name">{file.name}</p>}
    </div>
  );
}

export function InlineScheduleDetails({
  schedule,
}: {
  schedule: { id: string; title: string; service_date: string; venue: string | null; description: string | null; updated_at: string };
}) {
  const { error, formAction } = useServerFormAction(updateSchedule);
  return (
    <section className="schedule-editor-details">
      <form className="form-stack schedule-edit-form" action={formAction} data-dirty-form>
        <input type="hidden" name="return_to" value={`/admin/schedules/${schedule.id}`} />
        <input type="hidden" name="schedule_id" value={schedule.id} />
        <input type="hidden" name="expected_updated_at" value={schedule.updated_at} />
        <input type="hidden" name="description" value={schedule.description ?? ""} />
        <label htmlFor={`title-${schedule.id}`}>Title</label>
        <input id={`title-${schedule.id}`} name="title" defaultValue={schedule.title} required maxLength={200} />
        <label htmlFor={`venue-${schedule.id}`}>Venue</label>
        <input id={`venue-${schedule.id}`} name="venue" defaultValue={schedule.venue ?? ""} maxLength={200} />
        <label htmlFor={`date-${schedule.id}`}>Date</label>
        <input id={`date-${schedule.id}`} type="date" name="service_date" defaultValue={schedule.service_date} required />
        <label htmlFor={`description-${schedule.id}`}>Description <span className="muted">(optional)</span></label>
        <textarea id={`description-${schedule.id}`} name="description" defaultValue={schedule.description ?? ""} rows={2} maxLength={2000} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <PendingSubmitButton pendingLabel="Saving…">Save schedule</PendingSubmitButton>
      </form>
    </section>
  );
}

export function ScheduleActions({
  schedule,
}: {
  schedule: { id: string; title: string };
}) {
  return (
    <div className="schedule-editor-actions">
        <form>
          <input type="hidden" name="schedule_id" value={schedule.id} />
          <input type="hidden" name="return_to" value="/admin/schedules" />
          <ConfirmButton
            action={deleteSchedule}
            title={`Delete “${schedule.title}”?`}
            message="This permanently deletes the schedule and its items. Songs in the Songbook are not deleted."
            className="button button-danger"
            pendingLabel="Deleting…"
          >
            Delete schedule
          </ConfirmButton>
        </form>
    </div>
  );
}

export function NewScheduleForm() {
  const { error, formAction } = useServerFormAction(createSchedule);
  return (
    <form className="form-stack schedule-edit-form" action={formAction} data-dirty-form>
      <label htmlFor="new-service-title">Title</label><input id="new-service-title" name="title" required maxLength={200} />
      <label htmlFor="new-service-venue">Venue</label><input id="new-service-venue" name="venue" maxLength={200} />
      <label htmlFor="new-service-date">Date</label><input id="new-service-date" type="date" name="service_date" required />
      <label htmlFor="new-service-description">Description</label><textarea id="new-service-description" name="description" rows={3} maxLength={2000} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <PendingSubmitButton pendingLabel="Creating schedule…">Create schedule</PendingSubmitButton>
    </form>
  );
}
