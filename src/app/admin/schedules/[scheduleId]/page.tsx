import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  InlineScheduleDetails,
  InlineScheduleManager,
  ScheduleActions,
} from "@/components/admin/inline-schedule-manager";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export default async function EditSchedulePage({ params }: { params: Promise<{ scheduleId: string }> }) {
  await connection();
  if (!isSupabaseConfigured()) return null;
  const membership = await getMembership();
  if (!membership) return null;
  const { scheduleId } = await params;
  const supabase = await createClient();
  const [{ data: schedule, error }, { data: songs, error: songsError }] = await Promise.all([
    supabase.from("schedules")
      .select("id, title, service_date, venue, description, updated_at, schedule_items(id, item_type, title, position, leader_name, translator_name, translation_language, duration_minutes, public_content, link_title, link_url, media_url, background_image_url, song_id, updated_at, song:songs(id, title))")
      .eq("id", scheduleId).eq("church_id", membership.churchId).maybeSingle(),
    supabase.from("songs").select("id, title, language")
      .eq("church_id", membership.churchId).order("title").limit(1000),
  ]);
  if (error) throw new Error(`Unable to load service: ${error.message}`);
  if (songsError) throw new Error(`Unable to load songbook: ${songsError.message}`);
  if (!schedule) notFound();
  const items = [...(schedule.schedule_items ?? [])].sort((first, second) => first.position - second.position);
  const itemIds = items.map((item) => item.id);
  const { data: notes, error: notesError } = itemIds.length
    ? await supabase.from("schedule_item_notes").select("schedule_item_id, notes").in("schedule_item_id", itemIds)
    : { data: [], error: null };
  if (notesError) throw new Error(`Unable to load private service notes: ${notesError.message}`);
  const notesByItem = new Map((notes ?? []).map((note) => [note.schedule_item_id, note.notes]));

  return (
    <>
      <Link href="/schedule" className="back-link"><ArrowLeft size={15} /> Back to Sunday Schedule</Link>
      <h1 className="detail-title">{schedule.title}</h1>
      <InlineScheduleDetails schedule={schedule} />
      <section className="schedule-items-editor" aria-label="Schedule items">
        <h2>Schedule Items</h2>
        <InlineScheduleManager
          schedule={schedule}
          items={items.map((item) => ({ ...item, notes: notesByItem.get(item.id) ?? "" }))}
          songs={songs ?? []}
          returnTo={`/admin/schedules/${schedule.id}`}
          churchId={membership.churchId}
        />
      </section>
      <ScheduleActions schedule={schedule} />
    </>
  );
}
