import { Link } from "react-router-dom";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  FileUp,
  Film,
  ImagePlus,
  Link2,
  LoaderCircle,
  MoreHorizontal,
  MoreVertical,
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
} from "@/lib/actions/content";
import { ConfirmButton } from "@/components/confirm-button";
import { Dropdown } from "@/components/dropdown";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { useFormAction } from "@/components/use-form-action";
import { createClient } from "@/lib/supabase/browser";
import { getAnnouncementScheduleDestination } from "@/lib/domain/slides";
import { notifyDataChanged } from "@/spa/data-events";

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
  presentation_file_name: string | null;
  presentation_mime_type: string | null;
  background_image_url: string | null;
  show_in_slides: boolean;
  show_in_schedule: boolean | null;
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
  ["Announcements Slides", "announcement"],
  ["Worship", "song"],
  ["Sermon and Communion", "sermon"],
  ["Communion", "communion"],
  ["Communion Song", "song"],
  ["Contribution Song", "song"],
  ["Closing Prayer", "closing"],
  ["Closing Song", "song"],
] as const;
const customTitleOption = "__custom_schedule_item_title__";
const titleOptions = [
  ...itemTitles.map(([title, type]) => ({ label: title, value: title, disabled: type === "song" })),
  { label: "Other / Custom title", value: customTitleOption },
];
const insertionActions: Array<[string, ScheduleItemInput["item_type"], boolean]> = [
  ["Add Item Before", "other", true],
  ["Add Item After", "other", false],
  ["Add Song Before", "song", true],
  ["Add Song After", "song", false],
  ["Add Scripture Before", "scripture_reading", true],
  ["Add Scripture After", "scripture_reading", false],
];
function itemTypeForTitle(title: string, fallback: ScheduleItemInput["item_type"]): ScheduleItemInput["item_type"] {
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
const presentationTypes: Record<string, { extension: string; mimeType: string }> = {
  "application/pdf": { extension: "pdf", mimeType: "application/pdf" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    extension: "pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
};
const maxMediaSize = 50 * 1024 * 1024;

function presentationTypeForFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension === "pdf"
    ? presentationTypes["application/pdf"]
    : extension === "pptx"
      ? presentationTypes["application/vnd.openxmlformats-officedocument.presentationml.presentation"]
      : null;
}

type Draft = {
  id?: string;
  tempId: string;
  expectedUpdatedAt?: string;
  insert_relative_item_id?: string;
  insert_before?: boolean;
  song_title: string;
  customTitle: boolean;
  customTitleValue: string;
  item_type: ScheduleItemInput["item_type"];
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
  presentation_file_name: string;
  presentation_mime_type: string;
  background_image_url: string;
  show_in_slides: boolean;
  show_in_schedule: boolean;
};

function emptyDraft(
  itemType: ScheduleItemInput["item_type"],
  insertion?: { itemId: string; before: boolean },
): Draft {
  return {
    tempId: crypto.randomUUID(),
    insert_relative_item_id: insertion?.itemId,
    insert_before: insertion?.before,
    song_title: "",
    customTitle: false,
    customTitleValue: "",
    item_type: itemType,
    title: itemType === "scripture_reading" ? "Scripture" : itemType === "presentation" ? "Presentation" : itemType === "song" ? "Communion Song" : "",
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
    presentation_file_name: "",
    presentation_mime_type: "",
    background_image_url: "",
    show_in_slides: true,
    show_in_schedule: true,
  };
}

function draftFromItem(item: ScheduleItem): Draft {
  const song = Array.isArray(item.song) ? item.song[0] : item.song;
  const isScripture = item.item_type === "scripture_reading";
  const isPresentation = item.item_type === "presentation";
  const announcementDestination = getAnnouncementScheduleDestination(item.title);
  return {
    id: item.id,
    tempId: item.id,
    expectedUpdatedAt: item.updated_at,
    song_title: song?.title ?? "",
    customTitle: !isScripture && !isPresentation && !itemTitles.some(([title]) => title === item.title),
    customTitleValue: !isScripture && !isPresentation && !itemTitles.some(([title]) => title === item.title) ? item.title : "",
    item_type: item.item_type,
    title: isScripture ? "Scripture" : isPresentation ? "Presentation" : item.title,
    song_id: item.song_id ?? "",
    duration_minutes: item.duration_minutes?.toString() ?? "",
    leader_name: item.leader_name ?? "",
    translator_name: item.translator_name ?? "",
    translation_language: item.translation_language === "Kannada" || item.translation_language === "Tamil" || item.translation_language === "English"
      ? item.translation_language
      : "",
    link_title: announcementDestination?.linkTitle ?? item.link_title ?? "",
    link_url: announcementDestination?.url ?? item.link_url ?? "",
    public_content: item.public_content ?? "",
    notes: item.notes ?? "",
    media_url: item.media_url ?? "",
    presentation_file_name: item.presentation_file_name ?? "",
    presentation_mime_type: item.presentation_mime_type ?? "",
    background_image_url: item.background_image_url ?? "",
    show_in_slides: item.show_in_slides,
    show_in_schedule: item.show_in_schedule !== false,
  };
}

export function InlineScheduleManager({
  schedule,
  items,
  songs,
  privateNotesReady,
  songsReady,
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
  privateNotesReady: boolean;
  songsReady: boolean;
  returnTo: string;
  churchId: string;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<File | null>(null);
  const [selectedPresentation, setSelectedPresentation] = useState<File | null>(null);
  const [selectedBackground, setSelectedBackground] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [mediaValidation, setMediaValidation] = useState("");
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [contextMenuItemId, setContextMenuItemId] = useState<string | null>(null);

  function openAdd(itemType: ScheduleItemInput["item_type"] = "other", insertion?: { itemId: string; before: boolean }) {
    setDraft(emptyDraft(itemType, insertion));
    setContextMenuItemId(null);
    setSelectedMedia(null);
    setSelectedPresentation(null);
    setSelectedBackground(null);
    setError("");
    setMediaValidation("");
  }

  function openEdit(item: ScheduleItem) {
    setDraft(draftFromItem(item));
    setContextMenuItemId(null);
    setSelectedMedia(null);
    setSelectedPresentation(null);
    setSelectedBackground(null);
    setError("");
    setMediaValidation("");
  }

  const closeModal = useCallback(() => {
    if (saving) return;
    setDraft(null);
    setContextMenuItemId(null);
    setSelectedMedia(null);
    setSelectedPresentation(null);
    setSelectedBackground(null);
    setError("");
    setMediaValidation("");
  }, [saving]);

  async function uploadMedia(file: File, itemKey: string, kind: "media" | "background") {
    const supabase = createClient();
    const presentationType = kind === "media" && draft?.item_type === "presentation"
      ? presentationTypeForFile(file)
      : null;
    const extension = presentationType?.extension ?? mediaTypes[file.type];
    if (!extension) throw new Error("This media format is not supported.");
    const path = `${churchId}/${schedule.id}/${itemKey}/${kind}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("schedule-media").upload(path, file, {
      cacheControl: "3600",
      contentType: presentationType?.mimeType ?? file.type,
      upsert: false,
    });
    if (uploadError) throw new Error(`Unable to upload ${kind === "background" ? "background image" : presentationType ? "presentation file" : "media"}: ${uploadError.message}`);
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
    if (draft.item_type !== "presentation" && !draft.title.trim()) {
      setError("Enter an item title.");
      return;
    }
    if (draft.item_type === "song" && !draft.song_id && !draft.id) {
      setError(songsReady ? "Select a song from the church Songbook." : "Song options are still loading. Try again in a moment.");
      return;
    }
    setSaving(true);
    setUploading(Boolean(selectedMedia || selectedPresentation || selectedBackground));
    setError("");
    try {
      const announcementDestination = getAnnouncementScheduleDestination(draft.title);
      let mediaUrl = draft.media_url;
      let presentationFileName = draft.presentation_file_name;
      let presentationMimeType = draft.presentation_mime_type;
      let backgroundImageUrl = draft.background_image_url;
      if (selectedPresentation) {
        mediaUrl = await uploadMedia(selectedPresentation, draft.tempId, "media");
        presentationFileName = selectedPresentation.name;
        presentationMimeType = presentationTypeForFile(selectedPresentation)?.mimeType ?? "";
        setDraft((current) => current ? {
          ...current,
          media_url: mediaUrl,
          presentation_file_name: presentationFileName,
          presentation_mime_type: presentationMimeType,
        } : current);
        setSelectedPresentation(null);
      }
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
        ...(!draft.id && draft.insert_relative_item_id && draft.insert_before !== undefined
          ? { insert_relative_item_id: draft.insert_relative_item_id, insert_before: draft.insert_before }
          : {}),
        item_type: draft.item_type,
        title: draft.item_type === "scripture_reading" ? "Scripture" : draft.item_type === "presentation" ? "Presentation" : draft.title,
        song_id: draft.song_id,
        duration_minutes: draft.duration_minutes,
        leader_name: draft.leader_name,
        translator_name: draft.translator_name,
        translation_language: draft.translation_language,
        link_title: announcementDestination?.linkTitle ?? draft.link_title,
        link_url: announcementDestination?.url ?? draft.link_url,
        public_content: draft.public_content,
        notes: draft.notes,
        media_url: mediaUrl,
        presentation_file_name: presentationFileName,
        presentation_mime_type: presentationMimeType,
        background_image_url: backgroundImageUrl,
        show_in_slides: draft.show_in_slides,
        show_in_schedule: draft.show_in_schedule,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setFeedback(result.message);
      setDraft(null);
      setSelectedMedia(null);
      setSelectedPresentation(null);
      setSelectedBackground(null);
      notifyDataChanged();
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
      notifyDataChanged();
    } catch (duplicateError) {
      setFeedback(duplicateError instanceof Error ? duplicateError.message : "Unable to duplicate this item.");
    } finally {
      setDuplicatingId(null);
    }
  }

  const isAnnouncementSlidesDraft = draft?.title === "Announcements Slides" && !draft.customTitle;

  return (
    <section className="inline-owner-editor">
      <div className="inline-item-toolbar">
        <button className="button button-primary" type="button" onClick={() => openAdd()}>
          <Plus size={15} /> Add Item
        </button>
        <button className="button button-secondary" type="button" onClick={() => openAdd("song")} disabled={!songsReady}>
          <Plus size={15} /> Add Song
        </button>
        <button className="button button-secondary" type="button" onClick={() => openAdd("scripture_reading")}>
          <Plus size={15} /> Add Scripture
        </button>
        <button className="button button-secondary" type="button" onClick={() => openAdd("presentation")}>
          <FileUp size={15} /> Add PPT
        </button>
      </div>
      {!privateNotesReady && <p className="muted" role="status">Loading private schedule notes; existing items cannot be edited until they are ready.</p>}
      {privateNotesReady && !songsReady && <p className="muted" role="status">Loading Songbook options…</p>}
      {feedback && <p className="inline-item-feedback" role="status">{feedback}</p>}
      {items.length ? <ol className="inline-programme-list">
        {items.map((item, index) => {
          const relatedSong = Array.isArray(item.song) ? item.song[0] : item.song;
          const displayTitle = item.item_type === "scripture_reading"
            ? "Scripture"
            : item.item_type === "presentation" ? "Presentation" : item.title;
          return <li className="inline-programme-item" key={item.id}>
            <div className="inline-programme-actions">
              <div>
                <strong>{displayTitle}</strong>
                {relatedSong && <p className="muted">{relatedSong.title}</p>}
              </div>
              <div className="mini-actions">
                <div className="schedule-item-context">
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Insertion options for ${displayTitle}`}
                    aria-expanded={contextMenuItemId === item.id}
                    onClick={() => setContextMenuItemId(contextMenuItemId === item.id ? null : item.id)}
                  ><MoreVertical size={18} /></button>
                  {contextMenuItemId === item.id && <div className="schedule-item-context-menu" role="menu">
                    {insertionActions.map(([label, itemType, before]) => <button
                      type="button"
                      role="menuitem"
                      key={label}
                      disabled={itemType === "song" && !songsReady}
                      onClick={() => openAdd(itemType, { itemId: item.id, before })}
                    >{label}</button>)}
                  </div>}
                </div>
                <button className="icon-button" type="button" aria-label="Edit item" onClick={() => openEdit(item)} disabled={!privateNotesReady}>Edit</button>
                <button className="icon-button" type="button" aria-label={`Duplicate ${displayTitle}`} onClick={() => void duplicateItem(item)} disabled={duplicatingId !== null}>{duplicatingId === item.id ? "Duplicating…" : "Duplicate"}</button>
                <MoveScheduleItemForm itemId={item.id} direction={-1} returnTo={returnTo} disabled={index === 0} />
                <MoveScheduleItemForm itemId={item.id} direction={1} returnTo={returnTo} disabled={index === items.length - 1} />
                <form>
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <ConfirmButton
                    action={deleteScheduleItem}
                    title="Delete schedule item?"
                    message={`Delete “${displayTitle}” from this schedule? The selected Songbook entry will remain.`}
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
            <div><p className="eyebrow">SCHEDULE ITEM</p><h2 id="item-modal-title">
              {draft.item_type === "scripture_reading"
                ? draft.id ? "Edit Scripture" : "Add Scripture"
                : draft.item_type === "presentation"
                  ? draft.id ? "Edit Presentation" : "Add PPT"
                : draft.id ? "Edit item" : "Add item"}
            </h2></div>
            <button type="button" className="icon-button" aria-label="Close" onClick={closeModal}><X size={19} /></button>
          </header>
          <form className="item-modal-form" onSubmit={(event) => void saveItem(event)}>
            {draft.item_type === "presentation" ? <>
              <div className="scripture-fixed-title"><span>Title</span><strong>Presentation</strong></div>
              <PresentationFilePicker
                file={selectedPresentation}
                existingFileName={draft.presentation_file_name}
                onFile={setSelectedPresentation}
                onValidation={setMediaValidation}
              />
            </> : draft.item_type === "scripture_reading" ? <>
              <div className="scripture-fixed-title"><span>Title</span><strong>Scripture</strong></div>
              <label htmlFor="schedule-scripture-text">Scripture text</label>
              <textarea
                id="schedule-scripture-text"
                className="scripture-text-input"
                rows={12}
                maxLength={20000}
                value={draft.public_content}
                onChange={(event) => setDraft({ ...draft, public_content: event.target.value })}
              />
              <MediaPicker
                label="Background image"
                value={draft.background_image_url}
                file={selectedBackground}
                imageOnly
                onValue={(background_image_url) => setDraft({ ...draft, background_image_url })}
                onFile={setSelectedBackground}
                onValidation={setMediaValidation}
              />
            </> : <>
              <label htmlFor="schedule-item-title">Title <span aria-hidden="true">*</span></label>
              <Dropdown
                id="schedule-item-title"
                value={draft.customTitle ? customTitleOption : draft.title}
                required
                options={titleOptions.map((option) => ({
                  ...option,
                  disabled: option.value !== customTitleOption && "disabled" in option && option.disabled && !songsReady,
                }))}
                autoFocus={!draft.customTitle}
                onValueChange={(selection) => {
                  if (selection === customTitleOption) {
                    setDraft({
                      ...draft,
                      customTitle: true,
                      title: draft.customTitle ? draft.title : draft.customTitleValue,
                      item_type: draft.customTitle ? draft.item_type : "other",
                    });
                    return;
                  }
                  const itemType = itemTypeForTitle(selection, draft.item_type);
                  const destination = getAnnouncementScheduleDestination(selection);
                  setDraft({
                    ...draft,
                    title: selection,
                    item_type: itemType,
                    customTitle: false,
                    ...(destination ? { link_title: destination.linkTitle, link_url: destination.url } : {}),
                  });
                }}
                placeholder="Select a title"
              />
              {draft.customTitle && <>
                <label htmlFor="schedule-item-custom-title">Custom title <span aria-hidden="true">*</span></label>
                <input
                  id="schedule-item-custom-title"
                  value={draft.title}
                  maxLength={200}
                  required
                  autoFocus
                  onChange={(event) => setDraft({
                    ...draft,
                    title: event.currentTarget.value,
                    customTitleValue: event.currentTarget.value,
                  })}
                />
              </>}

              {!isAnnouncementSlidesDraft && <>
              {draft.item_type === "song" && <SongPicker
                songs={songs}
                value={draft.song_id}
                selectedTitle={draft.song_title}
                onChange={(songId) => setDraft({
                  ...draft,
                  song_id: songId,
                  song_title: songs.find(({ id }) => id === songId)?.title ?? "",
                })}
                onCreate={() => window.open("/admin/songs/new", "_blank", "noopener,noreferrer")}
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
                <Dropdown id="schedule-item-language" value={draft.translation_language} options={[
                  { label: "Select a language", value: "" },
                  { label: "Kannada", value: "Kannada" },
                  { label: "Tamil", value: "Tamil" },
                  { label: "English", value: "English" },
                ]} onValueChange={(language) => {
                  setDraft({ ...draft, translation_language: language === "Kannada" || language === "Tamil" || language === "English" ? language : "" });
                }} />
                <fieldset className="item-link-fields">
                  <legend><Link2 size={14} /> URL</legend>
                  {!getAnnouncementScheduleDestination(draft.title) && <>
                    <label htmlFor="schedule-item-link-title">Link Title</label>
                    <input id="schedule-item-link-title" value={draft.link_title} maxLength={200} onChange={(event) => setDraft({ ...draft, link_title: event.target.value })} />
                  </>}
                  <label htmlFor="schedule-item-link">Link</label>
                  <input
                    id="schedule-item-link"
                    type="url"
                    value={getAnnouncementScheduleDestination(draft.title)?.url ?? draft.link_url}
                    maxLength={2048}
                    readOnly={Boolean(getAnnouncementScheduleDestination(draft.title))}
                    onChange={(event) => setDraft({ ...draft, link_url: event.target.value })}
                  />
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
              </>}
              {isAnnouncementSlidesDraft && <fieldset className="item-link-fields">
                <legend><Link2 size={14} /> URL</legend>
                <label htmlFor="schedule-item-announcement-slides-url">Link</label>
                <input
                  id="schedule-item-announcement-slides-url"
                  type="url"
                  value={getAnnouncementScheduleDestination(draft.title)?.url ?? ""}
                  readOnly
                />
              </fieldset>}
            </>}
            <fieldset className="schedule-visibility-options">
              <legend>Display options</legend>
              <label className="schedule-visibility-option">
                <input type="checkbox" checked={draft.show_in_slides} disabled={saving} onChange={(event) => setDraft({ ...draft, show_in_slides: event.target.checked })} />
                <span>Display in Slides</span>
              </label>
              <label className="schedule-visibility-option">
                <input type="checkbox" checked={draft.show_in_schedule} disabled={saving} onChange={(event) => setDraft({ ...draft, show_in_schedule: event.target.checked })} />
                <span>Display in Schedule</span>
              </label>
            </fieldset>
            {draft.item_type !== "scripture_reading" && !isAnnouncementSlidesDraft && <>
              <label htmlFor="schedule-item-notes">Internal note <span className="muted">(owners only)</span></label>
              <textarea id="schedule-item-notes" rows={2} maxLength={2000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
            </>}

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
  selectedTitle,
  onChange,
  onCreate,
}: {
  songs: SongOption[];
  value: string;
  selectedTitle: string;
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
          {selected ? `${selected.title} · ${selected.language}` : selectedTitle || "Select a Songbook song"}
        </button>
        <div className="song-picker-menu">
          <button type="button" className="icon-button" aria-label="Song options" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><MoreHorizontal size={18} /></button>
          {menuOpen && <div className="song-picker-menu-popover">
            <button type="button" disabled={!selected} onClick={() => { onChange(""); setMenuOpen(false); }}>Clear</button>
            <button type="button" onClick={() => { setOpen(true); setMenuOpen(false); }}>Replace</button>
            {selected
              ? <Link to={`/songs/${selected.id}`} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>Open in new tab</Link>
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

function PresentationFilePicker({
  file,
  existingFileName,
  onFile,
  onValidation,
}: {
  file: File | null;
  existingFileName: string;
  onFile: (file: File | null) => void;
  onValidation: (message: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [validation, setValidation] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function selectFile(selected: File | undefined) {
    if (!selected) return;
    const extension = selected.name.split(".").pop()?.toLowerCase();
    if (extension === "ppt") {
      const message = "Legacy .ppt files are not supported. Convert the file to .pptx or PDF.";
      setValidation(message);
      onValidation(message);
      return;
    }
    const expectedType = extension === "pdf"
      ? presentationTypes["application/pdf"]
      : extension === "pptx"
        ? presentationTypes["application/vnd.openxmlformats-officedocument.presentationml.presentation"]
        : null;
    if (!expectedType) {
      const message = "Choose a PDF or PPTX presentation file.";
      setValidation(message);
      onValidation(message);
      return;
    }
    if (selected.size > maxMediaSize) {
      const message = "Presentation files must be 50 MB or smaller.";
      setValidation(message);
      onValidation(message);
      return;
    }
    if (selected.name.length > 255) {
      const message = "The presentation filename must be 255 characters or fewer.";
      setValidation(message);
      onValidation(message);
      return;
    }
    setValidation("");
    onValidation("");
    onFile(selected);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0]);
    event.target.value = "";
  }

  return (
    <div className="presentation-file-picker">
      <span className="presentation-file-picker-label">Presentation file</span>
      <div
        className={`presentation-file-drop-zone${dragging ? " is-dragging" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          selectFile(event.dataTransfer.files[0]);
        }}
      >
        <input
          ref={fileInput}
          type="file"
          hidden
          accept=".pdf,.pptx,.ppt,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
          onChange={onInputChange}
        />
        <FileText size={22} aria-hidden="true" />
        <div>
          <strong>{file?.name || existingFileName || "No presentation file selected"}</strong>
          <span>{file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : "PDF or PPTX · up to 50 MB"}</span>
        </div>
        <button type="button" className="button button-secondary" onClick={() => fileInput.current?.click()}>
          {file || existingFileName ? "Replace file" : "Choose file"}
        </button>
      </div>
      {validation && <p className="media-validation" role="alert">{validation}</p>}
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
  const { error, formAction } = useFormAction(updateSchedule);
  return (
    <section className="schedule-editor-details">
      <form className="form-stack schedule-edit-form" action={formAction} data-dirty-form>
        <input type="hidden" name="return_to" value={`/admin/schedules/${schedule.id}`} />
        <input type="hidden" name="schedule_id" value={schedule.id} />
        <input type="hidden" name="expected_updated_at" value={schedule.updated_at} />
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

function MoveScheduleItemForm({
  itemId,
  direction,
  returnTo,
  disabled,
}: {
  itemId: string;
  direction: -1 | 1;
  returnTo: string;
  disabled: boolean;
}) {
  const { error, formAction } = useFormAction(moveScheduleItem);
  const label = direction < 0 ? "Move item up" : "Move item down";
  return <form action={formAction}>
    <input type="hidden" name="item_id" value={itemId} />
    <input type="hidden" name="direction" value={direction} />
    <input type="hidden" name="return_to" value={returnTo} />
    <PendingSubmitButton className="icon-button" ariaLabel={label} pendingLabel="Moving…" disabled={disabled}>
      {direction < 0 ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
    </PendingSubmitButton>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
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
  const { error, formAction } = useFormAction(createSchedule);
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
