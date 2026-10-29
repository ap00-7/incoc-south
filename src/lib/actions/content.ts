import { z } from "zod";
import { requireOwner } from "@/lib/auth-client";
import { createClient } from "@/lib/supabase/browser";
import { parseDurationMinutes } from "@/lib/domain/validation";
import { lyricLanguageValues, songEditorLanguageValues, songSectionValues } from "@/lib/domain/songs";
import { sanitizeAnnouncementBody } from "@/lib/domain/announcement-body";
import { notifyDataChanged, notifyScheduleDeleted } from "@/spa/data-events";

function invalidateRouteData(path: string) {
  notifyDataChanged(path);
}

const songMetadataSchema = z.object({
  title: z.string().trim().min(1).max(200),
  language: z.enum(lyricLanguageValues),
  author: z.string().trim().max(200),
  source: z.string().trim().max(300),
});

const editableSongMetadataSchema = songMetadataSchema.extend({
  language: z.string().trim().min(1).max(80),
});

const songSectionSchema = z.object({
  section_type: z.enum(songSectionValues),
  section_label: z.string().trim().max(100),
  lyrics: z.string().min(1).max(20000),
  translation: z.string().max(20000),
  translation_language: z.enum(lyricLanguageValues).or(z.literal("")),
}).superRefine((section, context) => {
  if (section.translation.trim() && !section.translation_language) {
    context.addIssue({ code: "custom", message: "Choose a translation language." });
  }
  if (!section.translation.trim() && section.translation_language) {
    context.addIssue({ code: "custom", message: "Enter translated lyrics or clear the translation language." });
  }
});

const scheduleSchema = z.object({
  title: z.string().trim().min(1).max(200),
  service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  venue: z.string().trim().max(200),
  description: z.string().trim().max(2000),
});

function getReturnPath(formData: FormData, fallback: string) {
  const value = formData.get("return_to");
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  return value;
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

const scheduleItemTypeSchema = z.enum([
  "song", "worship", "sermon", "announcement", "communion", "offering",
  "other", "welcome", "closing", "prayer", "scripture_reading", "presentation",
]);
const itemTranslationLanguageSchema = z.enum(["Kannada", "Tamil", "English"]).or(z.literal(""));
const presentationMimeTypeSchema = z.enum([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]).or(z.literal(""));
const scheduleItemInputSchema = z.object({
  schedule_id: z.string().uuid(),
  item_id: z.string().uuid().optional(),
  expected_updated_at: z.string().datetime({ offset: true }).optional(),
  insert_relative_item_id: z.string().uuid().optional(),
  insert_before: z.boolean().optional(),
  item_type: scheduleItemTypeSchema,
  title: z.string().trim().min(1, "Enter an item title.").max(200),
  song_id: z.string().uuid().or(z.literal("")),
  duration_minutes: z.string(),
  leader_name: z.string().trim().max(200),
  translator_name: z.string().trim().max(200),
  translation_language: itemTranslationLanguageSchema,
  link_title: z.string().trim().max(200),
  link_url: z.string().trim().max(2048),
  public_content: z.string().max(20000),
  notes: z.string().trim().max(2000),
  media_url: z.string().trim().max(2048),
  presentation_file_name: z.string().trim().max(255),
  presentation_mime_type: presentationMimeTypeSchema,
  background_image_url: z.string().trim().max(2048),
  show_in_slides: z.boolean(),
  show_in_schedule: z.boolean(),
}).superRefine((item, context) => {
  if (Boolean(item.item_id) !== Boolean(item.expected_updated_at)) {
    context.addIssue({ code: "custom", message: "Reload this schedule item and try again." });
  }
  const hasInsertionTarget = Boolean(item.insert_relative_item_id);
  if (hasInsertionTarget !== (item.insert_before !== undefined) || (item.item_id && hasInsertionTarget)) {
    context.addIssue({ code: "custom", message: "The insertion position is invalid. Reopen the item and try again." });
  }
  for (const field of ["link_url", "media_url", "background_image_url"] as const) {
    const value = item[field];
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    } catch {
      context.addIssue({ code: "custom", path: [field], message: "Enter a valid web URL." });
    }
  }
  if (item.link_url && !item.link_title) {
    context.addIssue({ code: "custom", path: ["link_title"], message: "Enter a title for the link." });
  }
  if (item.item_type === "presentation") {
    const fileName = item.presentation_file_name.toLowerCase();
    if (fileName.endsWith(".ppt")) {
      context.addIssue({ code: "custom", path: ["presentation_file_name"], message: "Legacy .ppt files are not supported. Convert the file to .pptx or PDF." });
    } else {
      const expectedMimeType = fileName.endsWith(".pdf")
        ? "application/pdf"
        : fileName.endsWith(".pptx")
          ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
          : "";
      if (!item.media_url || !expectedMimeType || expectedMimeType !== item.presentation_mime_type) {
        context.addIssue({ code: "custom", path: ["presentation_file_name"], message: "Choose a PDF or PPTX presentation file." });
      }
    }
  } else if (item.presentation_file_name || item.presentation_mime_type) {
    context.addIssue({ code: "custom", path: ["presentation_file_name"], message: "Presentation file details are only valid for Presentation items." });
  }
});

export type ScheduleItemInput = z.input<typeof scheduleItemInputSchema>;
export type ScheduleItemSaveResult = { ok: true; message: string } | { ok: false; message: string };

export async function saveScheduleItem(input: ScheduleItemInput): Promise<ScheduleItemSaveResult> {
  const member = await requireOwner();
  const parsed = scheduleItemInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the item details and try again." };
  let duration: number | null;
  try {
    duration = parseDurationMinutes(parsed.data.duration_minutes);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Enter a valid duration." };
  }

  const supabase = await createClient();
  const { data: schedule, error: scheduleError } = await supabase.from("schedules")
    .select("id, church_id").eq("id", parsed.data.schedule_id).eq("church_id", member.churchId).maybeSingle();
  if (scheduleError) return { ok: false, message: `Unable to verify the schedule: ${scheduleError.message}` };
  if (!schedule) return { ok: false, message: "This schedule is not available to your account." };

  if (parsed.data.song_id) {
    const { data: song, error: songError } = await supabase.from("songs").select("id")
      .eq("id", parsed.data.song_id).eq("church_id", member.churchId).maybeSingle();
    if (songError) return { ok: false, message: `Unable to verify the selected song: ${songError.message}` };
    if (!song) return { ok: false, message: "Select a song from this church's Songbook." };
  }
  if (parsed.data.item_type === "prayer" || (parsed.data.item_type === "scripture_reading" && parsed.data.item_id)) {
    if (!parsed.data.item_id) return { ok: false, message: "Prayer items are only available on existing legacy items." };
    const { data: existingItem, error: existingItemError } = await supabase.from("schedule_items")
      .select("item_type").eq("id", parsed.data.item_id).eq("schedule_id", schedule.id)
      .eq("church_id", member.churchId).maybeSingle();
    if (existingItemError) return { ok: false, message: `Unable to verify this schedule item: ${existingItemError.message}` };
    if (existingItem?.item_type !== parsed.data.item_type) {
      return { ok: false, message: "This legacy item is no longer available." };
    }
  }

  const isScripture = parsed.data.item_type === "scripture_reading";
  const isPresentation = parsed.data.item_type === "presentation";
  const row = {
    item_type: parsed.data.item_type,
    title: isScripture ? "Scripture" : isPresentation ? "Presentation" : parsed.data.title,
    song_id: parsed.data.item_type === "song" ? parsed.data.song_id || null : null,
    leader_name: isScripture ? null : parsed.data.leader_name || null,
    translator_name: isScripture ? null : parsed.data.translator_name || null,
    translation_language: isScripture ? null : parsed.data.translation_language || null,
    duration_minutes: isScripture ? null : duration,
    public_content: isScripture
      ? parsed.data.public_content || null
      : parsed.data.public_content.trim() || null,
    link_title: isScripture ? null : parsed.data.link_title || null,
    link_url: isScripture ? null : parsed.data.link_url || null,
    media_url: isScripture ? null : parsed.data.media_url || null,
    presentation_file_name: isPresentation ? parsed.data.presentation_file_name || null : null,
    presentation_mime_type: isPresentation ? parsed.data.presentation_mime_type || null : null,
    background_image_url: parsed.data.background_image_url || null,
    show_in_slides: parsed.data.show_in_slides,
    show_in_schedule: parsed.data.show_in_schedule,
  };

  let itemId = parsed.data.item_id;
  if (itemId) {
    const expectedUpdatedAt = parsed.data.expected_updated_at;
    if (!expectedUpdatedAt) return { ok: false, message: "Reload this schedule item and try again." };
    const { data, error } = await supabase.from("schedule_items").update(row)
      .eq("id", itemId).eq("schedule_id", schedule.id).eq("church_id", member.churchId)
      .eq("updated_at", expectedUpdatedAt).select("id, show_in_slides, show_in_schedule").maybeSingle();
    if (error) return { ok: false, message: `Unable to save the item: ${error.message}` };
    if (!data) return { ok: false, message: "This item changed since you opened it. Reload and review the latest version." };
    if (data.show_in_slides !== parsed.data.show_in_slides) {
      return { ok: false, message: "The item was saved, but its Slides visibility could not be confirmed. Reload and try again." };
    }
    if (data.show_in_schedule !== parsed.data.show_in_schedule) {
      return { ok: false, message: "The item was saved, but its Schedule visibility could not be confirmed. Reload and try again." };
    }
  } else {
    const { data: scheduleItems, error: positionError } = await supabase.from("schedule_items")
      .select("id, position").eq("schedule_id", schedule.id).order("position");
    if (positionError) return { ok: false, message: `Unable to determine item order: ${positionError.message}` };
    const insertionTargetIndex = parsed.data.insert_relative_item_id
      ? scheduleItems?.findIndex(({ id }) => id === parsed.data.insert_relative_item_id) ?? -1
      : -1;
    if (parsed.data.insert_relative_item_id && insertionTargetIndex < 0) {
      return { ok: false, message: "The selected insertion point is no longer available. Reload the schedule and try again." };
    }
    const { data, error } = await supabase.from("schedule_items").insert({
      ...row,
      schedule_id: schedule.id,
      church_id: schedule.church_id,
      position: (scheduleItems?.[scheduleItems.length - 1]?.position ?? -1) + 1,
    }).select("id, show_in_slides, show_in_schedule").single();
    if (error) return { ok: false, message: `Unable to add the item: ${error.message}` };
    if (data.show_in_slides !== parsed.data.show_in_slides) {
      return { ok: false, message: "The item was added, but its Slides visibility could not be confirmed. Reload and try again." };
    }
    if (data.show_in_schedule !== parsed.data.show_in_schedule) {
      return { ok: false, message: "The item was added, but its Schedule visibility could not be confirmed. Reload and try again." };
    }
    itemId = data.id;
    if (insertionTargetIndex >= 0 && parsed.data.insert_before !== undefined) {
      const desiredIndex = insertionTargetIndex + (parsed.data.insert_before ? 0 : 1);
      const movesBefore = (scheduleItems?.length ?? 0) - desiredIndex;
      for (let move = 0; move < movesBefore; move += 1) {
        const { error: moveError } = await supabase.rpc("move_schedule_item", { target_item: itemId, direction: -1 });
        if (moveError) {
          const { error: cleanupError } = await supabase.from("schedule_items").delete()
            .eq("id", itemId).eq("schedule_id", schedule.id).eq("church_id", member.churchId);
          return {
            ok: false,
            message: cleanupError
              ? `The item could not be placed at the selected position (${moveError.message}), and cleanup failed (${cleanupError.message}). Review the schedule before continuing.`
              : `The item could not be placed at the selected position and was removed: ${moveError.message}`,
          };
        }
      }
    }
  }

  if (!itemId) return { ok: false, message: "The item was saved, but could not be identified for its private note." };
  if (parsed.data.notes) {
    const { error } = await supabase.from("schedule_item_notes").upsert(
      { schedule_item_id: itemId, notes: parsed.data.notes },
      { onConflict: "schedule_item_id" },
    );
    if (error) return { ok: false, message: `The item was saved, but its private note was not: ${error.message}` };
  } else if (itemId) {
    const { error } = await supabase.from("schedule_item_notes").delete().eq("schedule_item_id", itemId);
    if (error) return { ok: false, message: `The item was saved, but its private note could not be cleared: ${error.message}` };
  }

  invalidateRouteData("/schedule");
  invalidateRouteData("/slides");
  invalidateRouteData(`/schedule/${schedule.id}`);
  invalidateRouteData(`/schedule/${schedule.id}/slides`);
  return { ok: true, message: parsed.data.item_id ? "Schedule item saved." : "Schedule item added." };
}

export async function duplicateScheduleItem(input: { schedule_id: string; item_id: string }): Promise<ScheduleItemSaveResult> {
  const member = await requireOwner();
  const parsed = z.object({ schedule_id: z.string().uuid(), item_id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "The item could not be duplicated." };
  const supabase = await createClient();
  const { data: source, error: sourceError } = await supabase.from("schedule_items")
    .select("id, schedule_id, church_id, item_type, title, song_id, leader_name, translator_name, translation_language, duration_minutes, public_content, link_title, link_url, media_url, presentation_file_name, presentation_mime_type, background_image_url, show_in_slides, show_in_schedule, position")
    .eq("id", parsed.data.item_id).eq("schedule_id", parsed.data.schedule_id)
    .eq("church_id", member.churchId).maybeSingle();
  if (sourceError) return { ok: false, message: `Unable to load item to duplicate: ${sourceError.message}` };
  if (!source) return { ok: false, message: "This item is not available to your account." };
  const [{ data: orderedItems, error: positionError }, { data: notes, error: notesError }] = await Promise.all([
    supabase.from("schedule_items").select("id, position").eq("schedule_id", source.schedule_id)
      .eq("church_id", member.churchId).order("position"),
    supabase.from("schedule_item_notes").select("notes").eq("schedule_item_id", source.id).maybeSingle(),
  ]);
  if (positionError) return { ok: false, message: `Unable to determine item order: ${positionError.message}` };
  if (notesError) return { ok: false, message: `Unable to copy the private note: ${notesError.message}` };
  const sourceIndex = orderedItems?.findIndex((item) => item.id === source.id) ?? -1;
  if (!orderedItems || sourceIndex < 0) return { ok: false, message: "The item order changed. Reload the schedule and try again." };
  const { data: copy, error } = await supabase.from("schedule_items").insert({
    schedule_id: source.schedule_id,
    church_id: source.church_id,
    item_type: source.item_type,
    title: source.item_type === "scripture_reading"
      ? "Scripture"
      : source.item_type === "presentation" ? "Presentation" : `${source.title} (copy)`,
    song_id: source.song_id,
    leader_name: source.leader_name,
    translator_name: source.translator_name,
    translation_language: source.translation_language,
    duration_minutes: source.duration_minutes,
    public_content: source.public_content,
    link_title: source.link_title,
    link_url: source.link_url,
    media_url: source.media_url,
    presentation_file_name: source.presentation_file_name,
    presentation_mime_type: source.presentation_mime_type,
    background_image_url: source.background_image_url,
    show_in_slides: source.show_in_slides,
    show_in_schedule: source.show_in_schedule !== false,
    position: (orderedItems[orderedItems.length - 1]?.position ?? -1) + 1,
  }).select("id").single();
  if (error) return { ok: false, message: `Unable to duplicate item: ${error.message}` };
  let currentOrder = [...orderedItems.map((item) => item.id), copy.id];
  const destinationIndex = sourceIndex + 1;
  while (currentOrder.indexOf(copy.id) > destinationIndex) {
    const { error: moveError } = await supabase.rpc("move_schedule_item", { target_item: copy.id, direction: -1 });
    if (moveError) {
      invalidateRouteData(`/admin/schedules/${source.schedule_id}`);
      invalidateRouteData(`/schedule/${source.schedule_id}`);
      invalidateRouteData("/slides");
      return { ok: false, message: `The copy was created, but could not be placed after the original: ${moveError.message}. Reload the schedule to review its order.` };
    }
    const copyIndex = currentOrder.indexOf(copy.id);
    [currentOrder[copyIndex - 1], currentOrder[copyIndex]] = [currentOrder[copyIndex], currentOrder[copyIndex - 1]];
  }
  if (notes) {
    const { error: noteError } = await supabase.from("schedule_item_notes")
      .insert({ schedule_item_id: copy.id, notes: notes.notes });
    if (noteError) {
      invalidateRouteData(`/admin/schedules/${source.schedule_id}`);
      invalidateRouteData(`/schedule/${source.schedule_id}`);
      invalidateRouteData("/slides");
      return { ok: false, message: `The item was duplicated and placed correctly, but its private note could not be copied: ${noteError.message}` };
    }
  }
  invalidateRouteData("/schedule");
  invalidateRouteData(`/admin/schedules/${source.schedule_id}`);
  invalidateRouteData("/slides");
  invalidateRouteData(`/schedule/${source.schedule_id}`);
  return { ok: true, message: "Schedule item duplicated." };
}

export async function reorderScheduleItems(input: {
  schedule_id: string;
  expected_item_ids: string[];
  item_ids: string[];
}) {
  const member = await requireOwner();
  const parsed = z.object({
    schedule_id: z.string().uuid(),
    expected_item_ids: z.array(z.string().uuid()).min(1).max(500),
    item_ids: z.array(z.string().uuid()).min(1).max(500),
  }).safeParse(input);
  if (!parsed.success) throw new Error("The new schedule order is invalid. Reload and try again.");
  if (new Set(parsed.data.expected_item_ids).size !== parsed.data.expected_item_ids.length
    || new Set(parsed.data.item_ids).size !== parsed.data.item_ids.length
    || parsed.data.expected_item_ids.length !== parsed.data.item_ids.length
    || parsed.data.expected_item_ids.some((id) => !parsed.data.item_ids.includes(id))) {
    throw new Error("The schedule items changed. Reload the schedule before reordering.");
  }

  const supabase = await createClient();
  const { data: currentItems, error: itemsError } = await supabase.from("schedule_items")
    .select("id").eq("schedule_id", parsed.data.schedule_id).eq("church_id", member.churchId).order("position");
  if (itemsError) throw new Error(`Unable to verify the current schedule order: ${itemsError.message}`);
  const currentIds = currentItems.map((item) => item.id);
  if (currentIds.length !== parsed.data.expected_item_ids.length
    || currentIds.some((id, index) => id !== parsed.data.expected_item_ids[index])) {
    throw new Error("The schedule changed while you were reordering items. Reload and try again.");
  }

  const firstDifference = parsed.data.item_ids.findIndex((id, index) => id !== currentIds[index]);
  if (firstDifference < 0) return;
  const movedItemId = [currentIds[firstDifference], parsed.data.item_ids[firstDifference]].find((candidate) => {
    const currentWithout = currentIds.filter((id) => id !== candidate);
    const requestedWithout = parsed.data.item_ids.filter((id) => id !== candidate);
    return currentWithout.every((id, index) => id === requestedWithout[index]);
  });
  if (!movedItemId) throw new Error("Reordering must move one item at a time. Reload and try again.");

  const currentIndex = currentIds.indexOf(movedItemId);
  const destinationIndex = parsed.data.item_ids.indexOf(movedItemId);
  const direction = destinationIndex < currentIndex ? -1 : 1;
  for (let step = 0; step < Math.abs(destinationIndex - currentIndex); step += 1) {
    const { error } = await supabase.rpc("move_schedule_item", { target_item: movedItemId, direction });
    if (error) {
      invalidateRouteData(`/admin/schedules/${parsed.data.schedule_id}`);
      invalidateRouteData(`/schedule/${parsed.data.schedule_id}`);
      invalidateRouteData("/slides");
      throw new Error(`Unable to save the complete schedule order. Reload to review the saved order: ${error.message}`);
    }
  }

  invalidateRouteData(`/admin/schedules/${parsed.data.schedule_id}`);
  invalidateRouteData(`/schedule/${parsed.data.schedule_id}`);
  invalidateRouteData("/slides");
}

function parseSongSections(formData: FormData) {
  const rawSections = formData.get("sections");
  if (typeof rawSections !== "string") throw new Error("Add at least one valid lyric section.");
  let sectionsValue: unknown;
  try {
    sectionsValue = JSON.parse(rawSections);
  } catch {
    throw new Error("The lyric sections could not be read. Review the form and try again.");
  }
  const parsed = z.array(songSectionSchema).min(1).max(50).safeParse(sectionsValue);
  if (!parsed.success) throw new Error("Add a valid lyric and translation for every section.");
  return parsed.data;
}

const editorSectionSchema = z.object({
  id: z.string().uuid().optional(),
  section_type: z.enum(songSectionValues),
  section_label: z.string().trim().max(100),
  lyrics: z.string().max(20000),
  lyrics_language: z.string().trim().max(80),
  translation: z.string().max(20000),
  translation_language: z.string().max(80),
  is_hidden: z.boolean(),
});

function parseEditorSections(formData: FormData) {
  const rawSections = formData.get("sections");
  if (typeof rawSections !== "string") throw new Error("Add a valid lyric section.");
  let sectionsValue: unknown;
  try {
    sectionsValue = JSON.parse(rawSections);
  } catch {
    throw new Error("The lyric sections could not be read. Review the form and try again.");
  }
  const parsed = z.array(editorSectionSchema).min(1).max(50).safeParse(sectionsValue);
  if (!parsed.success) throw new Error("Review the song sections and try again.");
  const ids = parsed.data.flatMap((section) => section.id ? [section.id] : []);
  if (new Set(ids).size !== ids.length) throw new Error("A lyric section appears more than once.");
  return parsed.data;
}

export async function saveSong(formData: FormData) {
  const member = await requireOwner();
  const songIdValue = formData.get("song_id");
  const songId = typeof songIdValue === "string" && songIdValue ? z.string().uuid().parse(songIdValue) : null;
  const languageSchema = songId ? z.string().trim().min(1).max(80) : z.enum(songEditorLanguageValues);
  const parsedMetadata = z.object({
    title: z.string().trim().min(1).max(200),
    language: languageSchema,
    author: z.string().trim().max(200),
    source: z.string().trim().max(300),
    has_translation: z.boolean(),
    start_with_chorus: z.boolean(),
  }).safeParse({
    title: formData.get("title"),
    language: formData.get("language"),
    author: formData.get("author") ?? "",
    source: formData.get("source") ?? "",
    has_translation: formData.get("has_translation") === "on",
    start_with_chorus: formData.get("start_with_chorus") === "on",
  });
  if (!parsedMetadata.success) throw new Error("Enter a title and select one of the supported song languages.");
  const sections = parseEditorSections(formData);
  const supabase = await createClient();

  if (!songId) {
    const exactTitlePattern = parsedMetadata.data.title.replace(/[\\%_]/g, "\\$&");
    const { data: duplicateSongs, error: duplicateLookupError } = await supabase.from("songs")
      .select("id").eq("church_id", member.churchId).ilike("title", exactTitlePattern).limit(1);
    if (duplicateLookupError) throw new Error(`Unable to check for an existing song title: ${duplicateLookupError.message}`);
    if (duplicateSongs?.length) throw new Error("A song with this exact title already exists. Select the existing song instead.");

    const { data: song, error } = await supabase.from("songs").insert({
      church_id: member.churchId,
      created_by: member.user.id,
      title: parsedMetadata.data.title,
      language: parsedMetadata.data.language,
      author: parsedMetadata.data.author || null,
      source: parsedMetadata.data.source || null,
      is_published: true,
      has_translation: parsedMetadata.data.has_translation,
      start_with_chorus: parsedMetadata.data.start_with_chorus,
    }).select("id").single();
    if (error) throw new Error(`Unable to create song: ${error.message}`);
    const { error: sectionError } = await supabase.from("song_sections").insert(sections.map((section, position) => ({
      song_id: song.id,
      section_type: section.section_type,
      label: section.section_label || null,
      position,
      lyrics: section.lyrics,
      lyrics_language: section.lyrics_language || (parsedMetadata.data.language === "Multilingual" ? null : parsedMetadata.data.language),
      translation: section.translation.trim() || null,
      translation_language: section.translation.trim() ? section.translation_language || null : null,
      is_hidden: section.is_hidden,
    })));
    if (sectionError) {
      const { error: cleanupError } = await supabase.from("songs").delete()
        .eq("id", song.id).eq("church_id", member.churchId);
      if (cleanupError) throw new Error(`Song sections could not be saved (${sectionError.message}), and cleanup failed (${cleanupError.message}). Review the new song before retrying.`);
      throw new Error(`Song sections could not be saved, so the new song was removed: ${sectionError.message}`);
    }
    invalidateRouteData("/songs");
    invalidateRouteData("/admin/songs");
    return { redirectTo: getReturnPath(formData, `/admin/songs/${song.id}`) };
  }

  const expectedUpdatedAt = z.string().datetime({ offset: true }).parse(formData.get("expected_updated_at"));
  const { data: existingSong, error: lookupError } = await supabase.from("songs")
    .select("id").eq("id", songId).eq("church_id", member.churchId)
    .eq("updated_at", expectedUpdatedAt).maybeSingle();
  if (lookupError) throw new Error(`Unable to verify song details: ${lookupError.message}`);
  if (!existingSong) throw new Error("This song was changed by another owner. Reload and review the latest version before saving.");

  const { data: updatedSong, error: updateError } = await supabase.from("songs").update({
    title: parsedMetadata.data.title,
    language: parsedMetadata.data.language,
    author: parsedMetadata.data.author || null,
    source: parsedMetadata.data.source || null,
    is_published: true,
    has_translation: parsedMetadata.data.has_translation,
    start_with_chorus: parsedMetadata.data.start_with_chorus,
  }).eq("id", songId).eq("church_id", member.churchId).eq("updated_at", expectedUpdatedAt).select("id").maybeSingle();
  if (updateError) throw new Error(`Unable to update song: ${updateError.message}`);
  if (!updatedSong) throw new Error("This song was changed by another owner. Reload and review the latest version before saving.");

  const { data: existingSections, error: sectionLookupError } = await supabase.from("song_sections")
    .select("id, position").eq("song_id", songId).order("position");
  if (sectionLookupError) throw new Error(`Unable to load lyric sections: ${sectionLookupError.message}`);
  const existingIds = new Set((existingSections ?? []).map(({ id }) => id));
  if (sections.some((section) => section.id && !existingIds.has(section.id))) {
    throw new Error("A lyric section no longer belongs to this song. Reload and review the latest version.");
  }
  const retainedSectionIds = new Set(sections.flatMap((section) => section.id ? [section.id] : []));

  const savedPositionById = new Map((existingSections ?? []).map(({ id, position }) => [id, position]));
  const sectionOrderChanged = sections.some((section, position) =>
    section.id ? savedPositionById.get(section.id) !== position : (existingSections ?? []).some(({ position: savedPosition }) => savedPosition === position),
  );
  if (sectionOrderChanged) {
    const positionOffset = Math.max(0, ...(existingSections ?? []).map(({ position }) => position)) + sections.length + 1;
    for (const [index, section] of (existingSections ?? []).entries()) {
      const { error } = await supabase.from("song_sections").update({ position: positionOffset + index })
        .eq("id", section.id).eq("song_id", songId);
      if (error) throw new Error(`Unable to prepare lyric section ordering: ${error.message}`);
    }
  }
  const sectionRows = sections.map((section, position) => ({
    section,
    values: {
      song_id: songId,
      section_type: section.section_type,
      label: section.section_label || null,
      position,
      lyrics: section.lyrics,
      lyrics_language: section.lyrics_language || (parsedMetadata.data.language === "Multilingual" ? null : parsedMetadata.data.language),
      translation: section.translation.trim() || null,
      translation_language: section.translation.trim() ? section.translation_language || null : null,
      is_hidden: section.is_hidden,
    },
  }));
  for (const { section, values } of sectionRows) {
    if (!section.id) continue;
    const { data, error } = await supabase.from("song_sections").update(values)
      .eq("id", section.id).eq("song_id", songId).select("id").maybeSingle();
    if (error) throw new Error(`Unable to update lyric section: ${error.message}`);
    if (!data) throw new Error("A lyric section could not be updated. Reload and review the latest version.");
  }
  const removedSectionIds = [...existingIds].filter((id) => !retainedSectionIds.has(id));
  if (removedSectionIds.length > 0) {
    const { error: deleteSectionsError } = await supabase.from("song_sections").delete()
      .in("id", removedSectionIds).eq("song_id", songId);
    if (deleteSectionsError) throw new Error(`Unable to delete removed lyric sections: ${deleteSectionsError.message}`);
  }
  const newSectionRows = sectionRows.filter(({ section }) => !section.id).map(({ values }) => values);
  if (newSectionRows.length > 0) {
    const { error } = await supabase.from("song_sections").insert(newSectionRows);
    if (error) throw new Error(`Unable to save new lyric sections: ${error.message}`);
  }
  invalidateRouteData("/songs");
  invalidateRouteData(`/songs/${songId}`);
  invalidateRouteData(`/admin/songs/${songId}`);
  return { redirectTo: getReturnPath(formData, `/admin/songs/${songId}`) };
}

export async function createSong(formData: FormData) {
  const member = await requireOwner();
  const parsed = songMetadataSchema.safeParse({
    title: formData.get("title"),
    language: formData.get("language"),
    author: formData.get("author") ?? "",
    source: formData.get("source") ?? "",
  });
  if (!parsed.success) throw new Error("Enter a title and select one of the supported song languages.");
  const sections = parseSongSections(formData);
  const supabase = await createClient();
  const { data: song, error } = await supabase.from("songs").insert({
    church_id: member.churchId,
    created_by: member.user.id,
    title: parsed.data.title,
    language: parsed.data.language,
    author: parsed.data.author || null,
    source: parsed.data.source || null,
    is_published: true,
  }).select("id").single();
  if (error) throw new Error(`Unable to create song: ${error.message}`);

  const { error: sectionError } = await supabase.from("song_sections").insert(
    sections.map((section, position) => ({
      song_id: song.id,
      section_type: section.section_type,
      label: section.section_label || null,
      position,
      lyrics: section.lyrics,
      translation: section.translation.trim() || null,
      translation_language: section.translation.trim() ? section.translation_language : null,
    })),
  );
  if (sectionError) {
    const { error: cleanupError } = await supabase.from("songs").delete()
      .eq("id", song.id).eq("church_id", member.churchId);
    if (cleanupError) {
      throw new Error(`Song sections could not be saved (${sectionError.message}), and cleanup failed (${cleanupError.message}). Review the new song before retrying.`);
    }
    throw new Error(`Song sections could not be saved, so the new song was removed: ${sectionError.message}`);
  }
  invalidateRouteData("/songs");
  invalidateRouteData("/admin/songs");
  return { redirectTo: `/admin/songs/${song.id}` };
}

export async function updateSong(formData: FormData) {
  const member = await requireOwner();
  const songId = z.string().uuid().parse(formData.get("song_id"));
  const parsed = editableSongMetadataSchema.safeParse({
    title: formData.get("title"),
    language: formData.get("language"),
    author: formData.get("author") ?? "",
    source: formData.get("source") ?? "",
  });
  if (!parsed.success) throw new Error("Enter a title and language for the song.");
  const expectedUpdatedAt = z.string().datetime({ offset: true }).parse(formData.get("expected_updated_at"));
  const supabase = await createClient();
  const { data, error } = await supabase.from("songs").update({
    title: parsed.data.title,
    language: parsed.data.language,
    author: parsed.data.author || null,
    source: parsed.data.source || null,
    is_published: true,
  }).eq("id", songId).eq("church_id", member.churchId).eq("updated_at", expectedUpdatedAt).select("id").maybeSingle();
  if (error) throw new Error(`Unable to update song: ${error.message}`);
  if (!data) throw new Error("This song was changed by another owner. Reload the page and review the latest version before saving.");
  invalidateRouteData("/songs");
  invalidateRouteData(`/songs/${songId}`);
  invalidateRouteData(`/admin/songs/${songId}`);
  return { redirectTo: `/admin/songs/${songId}` };
}

export async function updateSongSection(formData: FormData) {
  await requireOwner();
  const songId = z.string().uuid().parse(formData.get("song_id"));
  const sectionId = z.string().uuid().parse(formData.get("section_id"));
  const expectedUpdatedAt = z.string().datetime({ offset: true }).parse(formData.get("expected_updated_at"));
  const parsed = songSectionSchema.safeParse({
    section_type: formData.get("section_type"),
    section_label: formData.get("section_label") ?? "",
    lyrics: formData.get("lyrics") ?? "",
    translation: formData.get("translation") ?? "",
    translation_language: formData.get("translation_language") ?? "",
  });
  if (!parsed.success) throw new Error("Enter a valid lyric section.");
  const supabase = await createClient();
  const updates = {
    section_type: parsed.data.section_type,
    label: parsed.data.section_label || null,
    lyrics: parsed.data.lyrics,
  };
  const request = supabase.from("song_sections").update({
    ...updates,
    ...(formData.get("translation_enabled") === "on" ? {
      translation: parsed.data.translation.trim() || null,
      translation_language: parsed.data.translation.trim() ? parsed.data.translation_language || null : null,
    } : {}),
  }).eq("id", sectionId).eq("song_id", songId).eq("updated_at", expectedUpdatedAt);
  const { data, error } = await request
    .select("id").maybeSingle();
  if (error) throw new Error(`Unable to update lyric section: ${error.message}`);
  if (!data) throw new Error("This lyric section was changed by another owner. Reload and review the latest version.");
  invalidateRouteData(`/songs/${songId}`);
  invalidateRouteData(`/admin/songs/${songId}`);
  return { redirectTo: `/admin/songs/${songId}` };
}

export async function addSongSection(formData: FormData) {
  await requireOwner();
  const songId = z.string().uuid().parse(formData.get("song_id"));
  const parsed = songSectionSchema.safeParse({
    section_type: formData.get("section_type"),
    section_label: formData.get("section_label") ?? "",
    lyrics: formData.get("lyrics") ?? "",
    translation: formData.get("translation") ?? "",
    translation_language: formData.get("translation_language") ?? "",
  });
  if (!parsed.success) throw new Error("Enter a valid lyric section.");
  const supabase = await createClient();
  const { data: sections, error: listError } = await supabase.from("song_sections")
    .select("position").eq("song_id", songId).order("position", { ascending: false }).limit(1);
  if (listError) throw new Error(`Unable to inspect lyric sections: ${listError.message}`);
  const { error } = await supabase.from("song_sections").insert({
    song_id: songId,
    section_type: parsed.data.section_type,
    label: parsed.data.section_label || null,
    lyrics: parsed.data.lyrics,
    translation: parsed.data.translation.trim() || null,
    translation_language: parsed.data.translation.trim() ? parsed.data.translation_language || null : null,
    position: (sections?.[0]?.position ?? -1) + 1,
  });
  if (error) throw new Error(`Unable to add lyric section: ${error.message}`);
  invalidateRouteData(`/songs/${songId}`);
  invalidateRouteData(`/admin/songs/${songId}`);
  return { redirectTo: `/admin/songs/${songId}` };
}

export async function moveSongSection(formData: FormData) {
  await requireOwner();
  const sectionId = z.string().uuid().parse(formData.get("section_id"));
  const direction = z.coerce.number().int().min(-1).max(1).refine((value) => value !== 0).parse(formData.get("direction"));
  const supabase = await createClient();
  const { data: section, error: lookupError } = await supabase.from("song_sections").select("song_id").eq("id", sectionId).single();
  if (lookupError) throw new Error(`Unable to find lyric section: ${lookupError.message}`);
  const { error } = await supabase.rpc("move_song_section", { target_section: sectionId, direction });
  if (error) throw new Error(`Unable to reorder lyric section: ${error.message}`);
  invalidateRouteData(`/songs/${section.song_id}`);
  invalidateRouteData(`/admin/songs/${section.song_id}`);
  return { redirectTo: `/admin/songs/${section.song_id}` };
}

export async function deleteSongSection(formData: FormData) {
  await requireOwner();
  const sectionId = z.string().uuid().parse(formData.get("section_id"));
  const supabase = await createClient();
  const { data: section, error: lookupError } = await supabase.from("song_sections").select("song_id").eq("id", sectionId).single();
  if (lookupError) throw new Error(`Unable to find lyric section: ${lookupError.message}`);
  const { error } = await supabase.from("song_sections").delete().eq("id", sectionId);
  if (error) throw new Error(`Unable to delete lyric section: ${error.message}`);
  invalidateRouteData(`/songs/${section.song_id}`);
  invalidateRouteData(`/admin/songs/${section.song_id}`);
  return { redirectTo: `/admin/songs/${section.song_id}` };
}

export async function deleteSong(formData: FormData) {
  const member = await requireOwner();
  const songId = z.string().uuid().parse(formData.get("song_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("songs").delete().eq("id", songId).eq("church_id", member.churchId);
  if (error) {
    if (error.code === "23503") throw new Error("This song is used by a service schedule and cannot be deleted.");
    throw new Error(`Unable to delete song: ${error.message}`);
  }
  invalidateRouteData("/admin/songs");
  invalidateRouteData("/songs");
  const returnTo = getReturnPath(formData, "/admin/songs");
  return { redirectTo: returnTo === "/admin/songs" ? "/songs" : returnTo };
}

export async function createSchedule(formData: FormData) {
  const member = await requireOwner();
  const parsed = scheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !isCalendarDate(parsed.data.service_date)) throw new Error("Enter a service title and a valid service date.");
  const supabase = await createClient();
  const { data: schedule, error } = await supabase.from("schedules").insert({
    church_id: member.churchId,
    created_by: member.user.id,
    title: parsed.data.title,
    service_date: parsed.data.service_date,
    venue: parsed.data.venue || null,
    description: parsed.data.description || null,
    status: "published",
    published_at: new Date().toISOString(),
  }).select("id").single();
  if (error) throw new Error(`Unable to create service: ${error.message}`);
  invalidateRouteData("/admin/schedules");
  invalidateRouteData("/schedule");
  invalidateRouteData("/slides");
  return { redirectTo: getReturnPath(formData, `/admin/schedules/${schedule.id}`) };
}

export async function updateSchedule(formData: FormData) {
  const member = await requireOwner();
  const scheduleId = z.string().uuid().parse(formData.get("schedule_id"));
  const expectedUpdatedAt = z.string().datetime({ offset: true }).parse(formData.get("expected_updated_at"));
  const parsed = scheduleSchema.safeParse({
    title: formData.get("title"),
    service_date: formData.get("service_date"),
    venue: formData.get("venue") ?? "",
    description: formData.get("description") ?? "",
  });
  if (!parsed.success || !isCalendarDate(parsed.data.service_date)) throw new Error("Enter a service title and a valid service date.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("schedules").update({
    title: parsed.data.title,
    service_date: parsed.data.service_date,
    venue: parsed.data.venue || null,
    description: parsed.data.description || null,
    status: "published",
    published_at: new Date().toISOString(),
  }).eq("id", scheduleId).eq("church_id", member.churchId)
    .eq("updated_at", expectedUpdatedAt).select("id").maybeSingle();
  if (error) throw new Error(`Unable to update service: ${error.message}`);
  if (!data) throw new Error("This service was changed by another owner. Reload and review the latest version before saving.");
  invalidateRouteData("/schedule");
  invalidateRouteData(`/schedule/${scheduleId}`);
  invalidateRouteData(`/admin/schedules/${scheduleId}`);
  invalidateRouteData("/slides");
  return { redirectTo: getReturnPath(formData, `/admin/schedules/${scheduleId}`) };
}

export async function addScheduleItem(formData: FormData) {
  const member = await requireOwner();
  const scheduleId = z.string().uuid().parse(formData.get("schedule_id"));
  const itemType = z.enum(["song", "worship", "sermon", "announcement", "communion", "offering", "other", "welcome", "closing"]).parse(formData.get("item_type"));
  const submittedTitle = z.string().trim().max(200).parse(formData.get("title") ?? "");
  const songId = formData.get("song_id")?.toString() || "";
  const durationRaw = formData.get("duration_minutes")?.toString() || "";
  const duration = parseDurationMinutes(durationRaw);
  const leaderName = z.string().trim().max(200).parse(formData.get("leader_name") ?? "");
  const notes = z.string().trim().max(2000).parse(formData.get("notes") ?? "");
  const publicContent = z.string().trim().max(5000).parse(formData.get("public_content") ?? "");
  if (itemType === "song" && !z.string().uuid().safeParse(songId).success) throw new Error("Select a song from the church songbook.");
  const supabase = await createClient();
  const [{ data: schedule, error: scheduleError }, { data: lastItems, error: itemsError }] = await Promise.all([
    supabase.from("schedules").select("church_id").eq("id", scheduleId).eq("church_id", member.churchId).single(),
    supabase.from("schedule_items").select("position").eq("schedule_id", scheduleId).order("position", { ascending: false }).limit(1),
  ]);
  if (scheduleError) throw new Error(`Unable to load service: ${scheduleError.message}`);
  if (itemsError) throw new Error(`Unable to inspect programme: ${itemsError.message}`);
  let title = submittedTitle;
  if (itemType === "song") {
    const { data: song, error: songError } = await supabase.from("songs")
      .select("title").eq("id", songId).eq("church_id", member.churchId).single();
    if (songError) throw new Error(`Unable to load selected song: ${songError.message}`);
    title = song.title;
  } else if (!title) {
    throw new Error("Enter a title for the programme item.");
  }
  const { data: insertedItem, error } = await supabase.from("schedule_items").insert({
    schedule_id: scheduleId,
    church_id: schedule.church_id,
    item_type: itemType,
    title,
    song_id: itemType === "song" ? songId : null,
    position: (lastItems?.[0]?.position ?? -1) + 1,
    leader_name: leaderName || null,
    duration_minutes: duration,
    public_content: publicContent || null,
    show_in_slides: true,
    show_in_schedule: true,
  }).select("id").single();
  if (error) throw new Error(`Unable to add programme item: ${error.message}`);
  if (notes) {
    const { error: noteError } = await supabase.from("schedule_item_notes").insert({
      schedule_item_id: insertedItem.id,
      notes,
    });
    if (noteError) throw new Error(`Programme item was added, but its private note could not be saved: ${noteError.message}`);
  }
  invalidateRouteData(`/admin/schedules/${scheduleId}`);
  invalidateRouteData(`/schedule/${scheduleId}`);
  invalidateRouteData("/slides");
  return { redirectTo: getReturnPath(formData, `/admin/schedules/${scheduleId}`) };
}

export async function moveScheduleItem(formData: FormData) {
  await requireOwner();
  const itemId = z.string().uuid().parse(formData.get("item_id"));
  const direction = z.coerce.number().int().min(-1).max(1).refine((value) => value !== 0).parse(formData.get("direction"));
  const supabase = await createClient();
  const { data: item, error: lookupError } = await supabase.from("schedule_items").select("schedule_id").eq("id", itemId).single();
  if (lookupError) throw new Error(`Unable to find programme item: ${lookupError.message}`);
  const { error } = await supabase.rpc("move_schedule_item", { target_item: itemId, direction });
  if (error) throw new Error(`Unable to reorder programme item: ${error.message}`);
  invalidateRouteData(`/admin/schedules/${item.schedule_id}`);
  invalidateRouteData(`/schedule/${item.schedule_id}`);
  invalidateRouteData("/slides");
}

export async function updateScheduleItem(formData: FormData) {
  const member = await requireOwner();
  const scheduleId = z.string().uuid().parse(formData.get("schedule_id"));
  const itemId = z.string().uuid().parse(formData.get("item_id"));
  const expectedUpdatedAt = z.string().datetime({ offset: true }).parse(formData.get("expected_updated_at"));
  const itemType = z.enum(["song", "worship", "sermon", "announcement", "communion", "offering", "other", "welcome", "closing", "prayer", "scripture_reading"]).parse(formData.get("item_type"));
  const songId = formData.get("song_id")?.toString() || "";
  const titleValue = z.string().trim().max(200).parse(formData.get("title") ?? "");
  const leaderName = z.string().trim().max(200).parse(formData.get("leader_name") ?? "");
  const duration = parseDurationMinutes(formData.get("duration_minutes")?.toString() || "");
  const publicContent = z.string().trim().max(5000).parse(formData.get("public_content") ?? "");
  const notes = z.string().trim().max(2000).parse(formData.get("notes") ?? "");
  const supabase = await createClient();
  if (itemType === "prayer" || itemType === "scripture_reading") {
    const { data: existingItem, error: existingItemError } = await supabase.from("schedule_items")
      .select("item_type").eq("id", itemId).eq("schedule_id", scheduleId)
      .eq("church_id", member.churchId).maybeSingle();
    if (existingItemError) throw new Error(`Unable to verify this legacy item: ${existingItemError.message}`);
    if (existingItem?.item_type !== itemType) throw new Error("This item type is no longer available for new schedule items.");
  }
  let title = titleValue;
  if (itemType === "song") {
    const validSongId = z.string().uuid().safeParse(songId);
    if (!validSongId.success) throw new Error("Select a song from the church songbook.");
    const { data: song, error } = await supabase.from("songs")
      .select("title").eq("id", songId).eq("church_id", member.churchId).single();
    if (error) throw new Error(`Unable to load selected song: ${error.message}`);
    title = song.title;
  } else if (!title) {
    throw new Error("Provide a title for this programme item.");
  }
  const { data, error } = await supabase.from("schedule_items").update({
    item_type: itemType,
    title: itemType === "scripture_reading" ? "Scripture" : title,
    song_id: itemType === "song" ? songId : null,
    leader_name: leaderName || null,
    duration_minutes: duration,
    public_content: publicContent || null,
  }).eq("id", itemId).eq("schedule_id", scheduleId).eq("church_id", member.churchId)
    .eq("updated_at", expectedUpdatedAt).select("id").maybeSingle();
  if (error) throw new Error(`Unable to update programme item: ${error.message}`);
  if (!data) throw new Error("This programme item was changed by another owner. Reload and review the latest version.");
  if (notes) {
    const { error: notesError } = await supabase.from("schedule_item_notes").upsert(
      { schedule_item_id: itemId, notes },
      { onConflict: "schedule_item_id" },
    );
    if (notesError) throw new Error(`Programme item was updated, but its private note could not be saved: ${notesError.message}`);
  } else {
    const { error: notesError } = await supabase.from("schedule_item_notes").delete().eq("schedule_item_id", itemId);
    if (notesError) throw new Error(`Programme item was updated, but its private note could not be removed: ${notesError.message}`);
  }
  invalidateRouteData(`/admin/schedules/${scheduleId}`);
  invalidateRouteData(`/schedule/${scheduleId}`);
  invalidateRouteData("/slides");
  return { redirectTo: getReturnPath(formData, `/admin/schedules/${scheduleId}`) };
}

export async function deleteScheduleItem(formData: FormData) {
  await requireOwner();
  const itemId = z.string().uuid().parse(formData.get("item_id"));
  const supabase = await createClient();
  const { data: item, error: lookupError } = await supabase.from("schedule_items").select("schedule_id").eq("id", itemId).single();
  if (lookupError) throw new Error(`Unable to find programme item: ${lookupError.message}`);
  const { error } = await supabase.from("schedule_items").delete().eq("id", itemId);
  if (error) throw new Error(`Unable to remove programme item: ${error.message}`);
  invalidateRouteData(`/admin/schedules/${item.schedule_id}`);
  invalidateRouteData(`/schedule/${item.schedule_id}`);
  invalidateRouteData("/slides");
  return { redirectTo: getReturnPath(formData, `/admin/schedules/${item.schedule_id}`) };
}

export async function deleteSchedule(formData: FormData) {
  const member = await requireOwner();
  const scheduleId = z.string().uuid().parse(formData.get("schedule_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("schedules").delete()
    .eq("id", scheduleId).eq("church_id", member.churchId);
  if (error) throw new Error(`Unable to delete schedule: ${error.message}`);
  notifyScheduleDeleted(scheduleId);
  invalidateRouteData("/admin/schedules");
  invalidateRouteData("/schedule");
  invalidateRouteData("/slides");
  return { redirectTo: getReturnPath(formData, "/admin/schedules") };
}

const announcementCollectionSchema = z.object({
  id: z.string().uuid().optional(),
  collection_name: z.string().trim().min(1).max(120),
  is_published: z.boolean().optional(),
});

const announcementItemSchema = z.object({
  collection_id: z.string().uuid(),
  id: z.string().uuid().optional(),
  expected_updated_at: z.string().datetime({ offset: true }).optional(),
  title: z.string().trim().max(200),
  image_url: z.string().trim().max(2048),
  body: z.string().max(10000).transform(sanitizeAnnouncementBody)
    .refine((body) => body.length <= 10000, "Announcement body must be 10,000 characters or fewer."),
}).superRefine((item, context) => {
  if (Boolean(item.id) !== Boolean(item.expected_updated_at)) {
    context.addIssue({ code: "custom", message: "Reload this announcement and try again." });
  }
  if (item.image_url) {
    try {
      const url = new URL(item.image_url);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    } catch {
      context.addIssue({ code: "custom", path: ["image_url"], message: "Choose a valid announcement image." });
    }
  }
});

function announcementStoragePath(imageUrl: string) {
  try {
    const marker = "/storage/v1/object/public/announcement-images/";
    const pathname = new URL(imageUrl).pathname;
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    return decodeURIComponent(pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

function isAnnouncementImageUrl(imageUrl: string, churchId: string, supabase: ReturnType<typeof createClient>) {
  const path = announcementStoragePath(imageUrl);
  const fileName = path?.startsWith(`${churchId}/`) ? path.slice(churchId.length + 1) : "";
  if (!path || !/^[\da-f-]{36}\.(?:png|jpg|webp|gif)$/i.test(fileName)) return false;
  return supabase.storage.from("announcement-images").getPublicUrl(path).data.publicUrl === imageUrl;
}

async function removeAnnouncementImage(imageUrl: string | null, churchId: string): Promise<string | null> {
  if (!imageUrl) return null;
  const path = announcementStoragePath(imageUrl);
  const fileName = path?.startsWith(`${churchId}/`) ? path.slice(churchId.length + 1) : "";
  if (!path || !/^[\da-f-]{36}\.(?:png|jpg|webp|gif)$/i.test(fileName)) return null;
  const supabase = await createClient();
  const bucket = supabase.storage.from("announcement-images");
  if (bucket.getPublicUrl(path).data.publicUrl !== imageUrl) return null;
  const { error } = await bucket.remove([path]);
  return error ? `Announcement was saved, but its previous image could not be removed: ${error.message}` : null;
}

async function requireAnnouncementOwner() {
  const member = await requireOwner();
  const supabase = await createClient();
  const { data: church, error } = await supabase.from("churches").select("id")
    .eq("id", member.churchId).eq("slug", "incoc-south").maybeSingle();
  if (error) throw new Error(`Unable to verify INCOC South ownership: ${error.message}`);
  if (!church) throw new Error("Announcement management is only available for INCOC South owners.");
  return { member, supabase };
}

export async function saveAnnouncementCollection(input: {
  id?: string;
  collection_name: string;
  is_published?: boolean;
}): Promise<string> {
  const { member, supabase } = await requireAnnouncementOwner();
  const parsed = announcementCollectionSchema.safeParse(input);
  if (!parsed.success) throw new Error("Enter a collection name up to 120 characters.");
  const { id, ...values } = parsed.data;
  if (id) {
    const { data, error } = await supabase.from("announcement_collections").update({
      collection_name: values.collection_name,
      ...(values.is_published !== undefined ? { is_published: values.is_published } : {}),
    }).eq("id", id).eq("church_id", member.churchId).select("id").maybeSingle();
    if (error) throw new Error(`Unable to save the announcement collection: ${error.message}`);
    if (!data) throw new Error("This announcement collection is no longer available.");
    return data.id;
  }
  const { data, error } = await supabase.from("announcement_collections").insert({
      church_id: member.churchId,
      collection_name: values.collection_name,
      is_published: values.is_published ?? false,
    }).select("id").single();
  if (error) throw new Error(`Unable to save the announcement collection: ${error.message}`);
  return data.id;
}

export async function deleteAnnouncementCollection(input: { id: string }) {
  const { member, supabase } = await requireAnnouncementOwner();
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) throw new Error("Choose a valid announcement collection.");
  const { data: collection, error: lookupError } = await supabase.from("announcement_collections")
    .select("id").eq("id", parsed.data.id).eq("church_id", member.churchId).maybeSingle();
  if (lookupError) throw new Error(`Unable to find the announcement collection: ${lookupError.message}`);
  if (!collection) throw new Error("This announcement collection is no longer available.");
  const { data: items, error: itemsError } = await supabase.from("announcement_items")
    .select("image_url").eq("collection_id", collection.id).eq("church_id", member.churchId);
  if (itemsError) throw new Error(`Unable to prepare the collection for deletion: ${itemsError.message}`);
  const { error } = await supabase.from("announcement_collections")
    .delete().eq("id", collection.id).eq("church_id", member.churchId);
  if (error) throw new Error(`Unable to delete the announcement collection: ${error.message}`);
  const cleanupNotices: string[] = [];
  for (const item of items ?? []) {
    const cleanupNotice = await removeAnnouncementImage(item.image_url, member.churchId);
    if (cleanupNotice) cleanupNotices.push(cleanupNotice);
  }
  return cleanupNotices.length ? cleanupNotices.join(" ") : null;
}

export async function saveAnnouncementItem(input: {
  collection_id: string;
  id?: string;
  expected_updated_at?: string;
  title: string;
  image_url: string;
  body: string;
}): Promise<string | null> {
  const { member, supabase } = await requireAnnouncementOwner();
  const parsed = announcementItemSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Review the announcement details and try again.");
  if (parsed.data.image_url && !isAnnouncementImageUrl(parsed.data.image_url, member.churchId, supabase)) {
    throw new Error("Choose an image uploaded for this announcement collection.");
  }
  if (parsed.data.id) {
    const expectedUpdatedAt = parsed.data.expected_updated_at;
    if (!expectedUpdatedAt) throw new Error("Reload this announcement and try again.");
    const { data: current, error: lookupError } = await supabase.from("announcement_items")
      .select("id, image_url").eq("id", parsed.data.id).eq("church_id", member.churchId)
      .eq("collection_id", parsed.data.collection_id)
      .eq("updated_at", expectedUpdatedAt).maybeSingle();
    if (lookupError) throw new Error(`Unable to verify this announcement: ${lookupError.message}`);
    if (!current) throw new Error("This announcement changed since it was opened. Reload and review the latest version.");
    const { data, error } = await supabase.from("announcement_items").update({
      title: parsed.data.title,
      image_url: parsed.data.image_url || null,
      body: parsed.data.body,
    }).eq("id", parsed.data.id).eq("church_id", member.churchId)
      .eq("updated_at", expectedUpdatedAt).select("id").maybeSingle();
    if (error) throw new Error(`Unable to save the announcement: ${error.message}`);
    if (!data) throw new Error("This announcement changed while it was being saved. Reload and review the latest version.");
    if (current.image_url && current.image_url !== (parsed.data.image_url || null)) {
      return removeAnnouncementImage(current.image_url, member.churchId);
    }
    return null;
  }

  const { data: lastItem, error: orderError } = await supabase.from("announcement_items")
    .select("position").eq("church_id", member.churchId).eq("collection_id", parsed.data.collection_id)
    .order("position", { ascending: false }).limit(1).maybeSingle();
  if (orderError) throw new Error(`Unable to determine announcement order: ${orderError.message}`);
  const { error } = await supabase.from("announcement_items").insert({
    church_id: member.churchId,
    collection_id: parsed.data.collection_id,
    title: parsed.data.title,
    image_url: parsed.data.image_url || null,
    body: parsed.data.body,
    position: (lastItem?.position ?? -1) + 1,
  });
  if (error) throw new Error(`Unable to create the announcement: ${error.message}`);
  return null;
}

export async function moveAnnouncementItem(input: { collection_id: string; id: string; direction: -1 | 1 }) {
  const { member, supabase } = await requireAnnouncementOwner();
  const parsed = z.object({
    collection_id: z.string().uuid(),
    id: z.string().uuid(),
    direction: z.union([z.literal(-1), z.literal(1)]),
  }).safeParse(input);
  if (!parsed.success) throw new Error("Choose a valid announcement to reorder.");
  const { data: items, error: listError } = await supabase.from("announcement_items")
    .select("id, position").eq("church_id", member.churchId)
    .eq("collection_id", parsed.data.collection_id).order("position");
  if (listError) throw new Error(`Unable to load announcement order: ${listError.message}`);
  const ordered = items ?? [];
  const index = ordered.findIndex(({ id }) => id === parsed.data.id);
  const targetIndex = index + parsed.data.direction;
  if (index < 0) throw new Error("This announcement is no longer available.");
  if (targetIndex < 0 || targetIndex >= ordered.length) return;
  const current = ordered[index];
  const target = ordered[targetIndex];
  const { error: moveError } = await supabase.from("announcement_items").update({ position: target.position })
    .eq("id", current.id).eq("church_id", member.churchId).eq("collection_id", parsed.data.collection_id);
  if (moveError) throw new Error(`Unable to save announcement order: ${moveError.message}`);
  const { error: swapError } = await supabase.from("announcement_items").update({ position: current.position })
    .eq("id", target.id).eq("church_id", member.churchId).eq("collection_id", parsed.data.collection_id);
  if (swapError) throw new Error(`Unable to save announcement order: ${swapError.message}`);
}

export async function deleteAnnouncementItem(input: { id: string; collection_id: string }): Promise<string | null> {
  const { member, supabase } = await requireAnnouncementOwner();
  const parsed = z.object({ id: z.string().uuid(), collection_id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) throw new Error("Choose a valid announcement to delete.");
  const { data: item, error: lookupError } = await supabase.from("announcement_items")
    .select("id, image_url").eq("id", parsed.data.id).eq("church_id", member.churchId)
    .eq("collection_id", parsed.data.collection_id).maybeSingle();
  if (lookupError) throw new Error(`Unable to find the announcement: ${lookupError.message}`);
  if (!item) throw new Error("This announcement is no longer available.");
  const { error } = await supabase.from("announcement_items")
    .delete().eq("id", item.id).eq("church_id", member.churchId)
    .eq("collection_id", parsed.data.collection_id);
  if (error) throw new Error(`Unable to delete the announcement: ${error.message}`);
  return removeAnnouncementImage(item.image_url, member.churchId);
}
