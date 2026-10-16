"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseDurationMinutes } from "@/lib/domain/validation";

const songSchema = z.object({
  title: z.string().trim().min(1).max(200),
  language: z.string().trim().min(1).max(80),
  author: z.string().trim().max(200),
  source: z.string().trim().max(300),
  section_type: z.enum(["verse", "chorus", "pre_chorus", "bridge", "intro", "outro", "other"]),
  section_label: z.string().trim().max(100),
  lyrics: z.string().max(20000),
});

const scheduleSchema = z.object({
  title: z.string().trim().min(1).max(200),
  service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  venue: z.string().trim().max(200),
  description: z.string().trim().max(2000),
});

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export async function createSong(formData: FormData) {
  const member = await requireOwner();
  const parsed = songSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Enter a title, language, and valid lyric section.");
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

  const { error: sectionError } = await supabase.from("song_sections").insert({
    song_id: song.id,
    section_type: parsed.data.section_type,
    label: parsed.data.section_label || null,
    position: 0,
    lyrics: parsed.data.lyrics,
  });
  if (sectionError) throw new Error(`Song was created, but its first lyric section could not be saved: ${sectionError.message}`);
  revalidatePath("/songbook");
  revalidatePath("/admin/songs");
  redirect(`/admin/songs/${song.id}`);
}

export async function updateSong(formData: FormData) {
  const member = await requireOwner();
  const songId = z.string().uuid().parse(formData.get("song_id"));
  const parsed = songSchema.pick({ title: true, language: true, author: true, source: true }).safeParse({
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
  const parsed = z.object({
    section_type: songSchema.shape.section_type,
    section_label: z.string().trim().max(100),
    lyrics: z.string().max(20000),
  }).safeParse({
    section_type: formData.get("section_type"),
    section_label: formData.get("section_label") ?? "",
    lyrics: formData.get("lyrics") ?? "",
  });
  if (!parsed.success) throw new Error("Enter a valid lyric section.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("song_sections").update({
    section_type: parsed.data.section_type,
    label: parsed.data.section_label || null,
    lyrics: parsed.data.lyrics,
  }).eq("id", sectionId).eq("song_id", songId).eq("updated_at", expectedUpdatedAt)
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
  const parsed = z.object({
    section_type: songSchema.shape.section_type,
    section_label: z.string().trim().max(100),
    lyrics: z.string().max(20000),
  }).safeParse({
    section_type: formData.get("section_type"),
    section_label: formData.get("section_label") ?? "",
    lyrics: formData.get("lyrics") ?? "",
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
  redirect("/admin/songs");
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
  redirect(`/admin/schedules/${schedule.id}`);
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
  redirect(`/admin/schedules/${scheduleId}`);
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
  redirect(`/admin/schedules/${scheduleId}`);
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
  redirect(`/admin/schedules/${item.schedule_id}`);
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
  redirect(`/admin/schedules/${scheduleId}`);
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
  redirect(`/admin/schedules/${item.schedule_id}`);
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
  redirect(`/admin/schedules/${scheduleId}`);
}
