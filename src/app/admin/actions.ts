"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseDurationMinutes } from "@/lib/domain/validation";
import { songEditorLanguageValues, songLanguageValues, songSectionValues } from "@/lib/domain/songs";

const songMetadataSchema = z.object({
  title: z.string().trim().min(1).max(200),
  language: z.enum(songLanguageValues),
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
  translation_language: z.enum(songLanguageValues).or(z.literal("")),
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
    is_published: z.boolean(),
    has_translation: z.boolean(),
    start_with_chorus: z.boolean(),
  }).safeParse({
    title: formData.get("title"),
    language: formData.get("language"),
    author: formData.get("author") ?? "",
    source: formData.get("source") ?? "",
    is_published: formData.get("is_published") === "on",
    has_translation: formData.get("has_translation") === "on",
    start_with_chorus: formData.get("start_with_chorus") === "on",
  });
  if (!parsedMetadata.success) throw new Error("Enter a title and select one of the supported song languages.");
  const sections = parseEditorSections(formData);
  const supabase = await createClient();

  if (!songId) {
    const { data: song, error } = await supabase.from("songs").insert({
      church_id: member.churchId,
      created_by: member.user.id,
      title: parsedMetadata.data.title,
      language: parsedMetadata.data.language,
      author: parsedMetadata.data.author || null,
      source: parsedMetadata.data.source || null,
      is_published: parsedMetadata.data.is_published,
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
    revalidatePath("/songbook");
    revalidatePath("/admin/songs");
    redirect(getReturnPath(formData, `/admin/songs/${song.id}`));
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
    is_published: parsedMetadata.data.is_published,
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
  const rows = sections.map((section, position) => ({
    ...(section.id ? { id: section.id } : {}),
    song_id: songId,
    section_type: section.section_type,
    label: section.section_label || null,
    position,
    lyrics: section.lyrics,
    translation: section.translation.trim() || null,
    translation_language: section.translation.trim() ? section.translation_language || null : null,
    is_hidden: section.is_hidden,
  }));
  const { error: saveSectionsError } = await supabase.from("song_sections").upsert(rows, { onConflict: "id" });
  if (saveSectionsError) throw new Error(`Unable to save lyric sections: ${saveSectionsError.message}`);
  revalidatePath("/songbook");
  revalidatePath(`/songbook/${songId}`);
  revalidatePath(`/admin/songs/${songId}`);
  redirect(getReturnPath(formData, `/admin/songs/${songId}`));
}

export async function setSongPublication(formData: FormData) {
  const member = await requireOwner();
  const songId = z.string().uuid().parse(formData.get("song_id"));
  const isPublished = z.enum(["true", "false"]).transform((value) => value === "true").parse(formData.get("is_published"));
  const expectedUpdatedAt = z.string().datetime({ offset: true }).parse(formData.get("expected_updated_at"));
  const supabase = await createClient();
  const { data, error } = await supabase.from("songs").update({ is_published: isPublished })
    .eq("id", songId).eq("church_id", member.churchId).eq("updated_at", expectedUpdatedAt)
    .select("id").maybeSingle();
  if (error) throw new Error(`Unable to ${isPublished ? "publish" : "unpublish"} song: ${error.message}`);
  if (!data) throw new Error("This song was changed by another owner. Reload and review the latest version before changing publication.");
  revalidatePath("/songbook");
  revalidatePath(`/songbook/${songId}`);
  redirect(getReturnPath(formData, "/songbook"));
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
  revalidatePath("/songbook");
  revalidatePath("/admin/songs");
  redirect(`/admin/songs/${song.id}`);
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
  }).eq("id", songId).eq("church_id", member.churchId).eq("updated_at", expectedUpdatedAt).select("id").maybeSingle();
  if (error) throw new Error(`Unable to update song: ${error.message}`);
  if (!data) throw new Error("This song was changed by another owner. Reload the page and review the latest version before saving.");
  revalidatePath("/songbook");
  revalidatePath(`/songbook/${songId}`);
  revalidatePath(`/admin/songs/${songId}`);
  redirect(`/admin/songs/${songId}`);
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
  revalidatePath(`/songbook/${songId}`);
  revalidatePath(`/admin/songs/${songId}`);
  redirect(`/admin/songs/${songId}`);
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
  revalidatePath(`/songbook/${songId}`);
  revalidatePath(`/admin/songs/${songId}`);
  redirect(`/admin/songs/${songId}`);
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
  revalidatePath(`/songbook/${section.song_id}`);
  revalidatePath(`/admin/songs/${section.song_id}`);
  redirect(`/admin/songs/${section.song_id}`);
}

export async function deleteSongSection(formData: FormData) {
  await requireOwner();
  const sectionId = z.string().uuid().parse(formData.get("section_id"));
  const supabase = await createClient();
  const { data: section, error: lookupError } = await supabase.from("song_sections").select("song_id").eq("id", sectionId).single();
  if (lookupError) throw new Error(`Unable to find lyric section: ${lookupError.message}`);
  const { error } = await supabase.from("song_sections").delete().eq("id", sectionId);
  if (error) throw new Error(`Unable to delete lyric section: ${error.message}`);
  revalidatePath(`/songbook/${section.song_id}`);
  revalidatePath(`/admin/songs/${section.song_id}`);
  redirect(`/admin/songs/${section.song_id}`);
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
  revalidatePath("/admin/songs");
  revalidatePath("/songbook");
  redirect(getReturnPath(formData, "/admin/songs"));
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
  }).select("id").single();
  if (error) throw new Error(`Unable to create service: ${error.message}`);
  revalidatePath("/admin/schedules");
  revalidatePath("/schedule");
  revalidatePath("/slides");
  redirect(getReturnPath(formData, `/admin/schedules/${schedule.id}`));
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
  }).eq("id", scheduleId).eq("church_id", member.churchId)
    .eq("updated_at", expectedUpdatedAt).select("id").maybeSingle();
  if (error) throw new Error(`Unable to update service: ${error.message}`);
  if (!data) throw new Error("This service was changed by another owner. Reload and review the latest version before saving.");
  revalidatePath("/schedule");
  revalidatePath(`/schedule/${scheduleId}`);
  revalidatePath(`/admin/schedules/${scheduleId}`);
  revalidatePath("/slides");
  redirect(getReturnPath(formData, `/admin/schedules/${scheduleId}`));
}

export async function addScheduleItem(formData: FormData) {
  const member = await requireOwner();
  const scheduleId = z.string().uuid().parse(formData.get("schedule_id"));
  const itemType = z.enum(["song", "worship", "prayer", "sermon", "scripture_reading", "announcement", "communion", "offering", "other"]).parse(formData.get("item_type"));
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
  }).select("id").single();
  if (error) throw new Error(`Unable to add programme item: ${error.message}`);
  if (notes) {
    const { error: noteError } = await supabase.from("schedule_item_notes").insert({
      schedule_item_id: insertedItem.id,
      notes,
    });
    if (noteError) throw new Error(`Programme item was added, but its private note could not be saved: ${noteError.message}`);
  }
  revalidatePath(`/admin/schedules/${scheduleId}`);
  revalidatePath(`/schedule/${scheduleId}`);
  revalidatePath("/slides");
  redirect(getReturnPath(formData, `/admin/schedules/${scheduleId}`));
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
  revalidatePath(`/admin/schedules/${item.schedule_id}`);
  revalidatePath(`/schedule/${item.schedule_id}`);
  revalidatePath("/slides");
  redirect(getReturnPath(formData, `/admin/schedules/${item.schedule_id}`));
}

export async function updateScheduleItem(formData: FormData) {
  const member = await requireOwner();
  const scheduleId = z.string().uuid().parse(formData.get("schedule_id"));
  const itemId = z.string().uuid().parse(formData.get("item_id"));
  const expectedUpdatedAt = z.string().datetime({ offset: true }).parse(formData.get("expected_updated_at"));
  const itemType = z.enum(["song", "worship", "prayer", "sermon", "scripture_reading", "announcement", "communion", "offering", "other"]).parse(formData.get("item_type"));
  const songId = formData.get("song_id")?.toString() || "";
  const titleValue = z.string().trim().max(200).parse(formData.get("title") ?? "");
  const leaderName = z.string().trim().max(200).parse(formData.get("leader_name") ?? "");
  const duration = parseDurationMinutes(formData.get("duration_minutes")?.toString() || "");
  const publicContent = z.string().trim().max(5000).parse(formData.get("public_content") ?? "");
  const notes = z.string().trim().max(2000).parse(formData.get("notes") ?? "");
  const supabase = await createClient();
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
    title,
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
  revalidatePath(`/admin/schedules/${scheduleId}`);
  revalidatePath(`/schedule/${scheduleId}`);
  revalidatePath("/slides");
  redirect(getReturnPath(formData, `/admin/schedules/${scheduleId}`));
}

export async function deleteScheduleItem(formData: FormData) {
  await requireOwner();
  const itemId = z.string().uuid().parse(formData.get("item_id"));
  const supabase = await createClient();
  const { data: item, error: lookupError } = await supabase.from("schedule_items").select("schedule_id").eq("id", itemId).single();
  if (lookupError) throw new Error(`Unable to find programme item: ${lookupError.message}`);
  const { error } = await supabase.from("schedule_items").delete().eq("id", itemId);
  if (error) throw new Error(`Unable to remove programme item: ${error.message}`);
  revalidatePath(`/admin/schedules/${item.schedule_id}`);
  revalidatePath(`/schedule/${item.schedule_id}`);
  revalidatePath("/slides");
  redirect(getReturnPath(formData, `/admin/schedules/${item.schedule_id}`));
}

export async function setScheduleStatus(formData: FormData) {
  await requireOwner();
  const scheduleId = z.string().uuid().parse(formData.get("schedule_id"));
  const status = z.enum(["draft", "published"]).parse(formData.get("status"));
  const supabase = await createClient();
  const { error } = await supabase.from("schedules").update({
    status,
    published_at: status === "published" ? new Date().toISOString() : null,
  }).eq("id", scheduleId);
  if (error) throw new Error(`Unable to ${status === "published" ? "publish" : "unpublish"} service: ${error.message}`);
  revalidatePath("/schedule");
  revalidatePath(`/schedule/${scheduleId}`);
  revalidatePath(`/schedule/${scheduleId}/slides`);
  revalidatePath(`/admin/schedules/${scheduleId}`);
  revalidatePath("/slides");
  redirect(getReturnPath(formData, `/admin/schedules/${scheduleId}`));
}
