import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, CalendarDays, MonitorPlay } from "lucide-react";
import { connection } from "next/server";
import { PageContentLoading, PageShell, SectionHeading } from "@/components/page-shell";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { InlineScheduleManager } from "@/components/admin/inline-schedule-manager";
import { hasSupabaseAuthCookie, getMembership } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getPublicChurchContext } from "@/lib/supabase/public-content";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "long",
  timeZone: "Asia/Kolkata",
});

type Props = { searchParams: Promise<{ page?: string }> };
const PAGE_SIZE = 50;

export default function SlidesIndexPage({ searchParams }: Props) {
  return (
    <PageShell>
      <Suspense fallback={<PageContentLoading title="Choose a presentation" />}>
        <SlidesIndexContent searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function SlidesIndexContent({ searchParams }: Props) {
  await connection();
  if (!isSupabaseConfigured()) {
    return <div className="content-wrap"><SectionHeading eyebrow="SLIDES" title="Choose a presentation" /><div className="notice notice-warning">Published presentations will appear here after Supabase is configured.</div></div>;
  }
  const params = await searchParams;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), 10_000) : 1;
  const { supabase, churchId } = await getPublicChurchContext();
  const membership = await hasSupabaseAuthCookie() ? await getMembership(supabase) : null;
  const isOwner = membership?.role === "owner";
  let schedulesQuery = supabase.from("schedules")
    .select("id, title, service_date, venue, description, status, updated_at")
    .eq("church_id", churchId);
  if (!isOwner) schedulesQuery = schedulesQuery.eq("status", "published");
  const { data: schedules, error } = await schedulesQuery
    .order("service_date", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (error) throw new Error(`Unable to load presentations: ${error.message}`);
  const schedulesForPage = schedules ?? [];
  const hasNextPage = schedulesForPage.length > PAGE_SIZE;
  const visibleSchedules = schedulesForPage.slice(0, PAGE_SIZE);
  const scheduleIds = visibleSchedules.map(({ id }) => id);
  const [{ data: items, error: itemsError }, { data: songs, error: songsError }] = isOwner ? await Promise.all([
    scheduleIds.length
      ? supabase.from("schedule_items").select("id, schedule_id, item_type, title, position, leader_name, duration_minutes, public_content, song_id, updated_at, song:songs(title)").in("schedule_id", scheduleIds).order("position")
      : Promise.resolve({ data: [], error: null }),
    supabase.from("songs").select("id, title, language").eq("church_id", churchId).order("title").limit(200),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (itemsError) throw new Error(`Unable to load slide content: ${itemsError.message}`);
  if (songsError) throw new Error(`Unable to load songs for slide editing: ${songsError.message}`);
  const notesByItem = new Map<string, string>();
  const itemIds = (items ?? []).map(({ id }) => id);
  if (isOwner && itemIds.length) {
    const { data: notes, error: notesError } = await supabase.from("schedule_item_notes").select("schedule_item_id, notes").in("schedule_item_id", itemIds);
    if (notesError) throw new Error(`Unable to load private service notes: ${notesError.message}`);
    for (const note of notes ?? []) notesByItem.set(note.schedule_item_id, note.notes);
  }

  return (
    <>
      <RealtimeRefresh subscriptions={[{ table: "schedules", column: "church_id", value: churchId }]} />
      <div className="content-wrap">
        <SectionHeading eyebrow="SLIDES" title="Choose a presentation" description="Open the slides for a published Sunday service." />
        {visibleSchedules.length ? <div className="results-list">
          {visibleSchedules.map((schedule) => <article className="public-list-entry" key={schedule.id}>
            <Link className="result-card" href={`/schedule/${schedule.id}/slides`}>
              <div>
                <h2>{schedule.title}</h2>
                <p><CalendarDays size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />{dateFormatter.format(new Date(`${schedule.service_date}T12:00:00+05:30`))}{schedule.venue ? ` · ${schedule.venue}` : ""}</p>
              </div>
              <span className="public-entry-meta">{schedule.status === "draft" ? "Draft" : ""}<MonitorPlay size={15} /> Open slides <ArrowRight size={15} /></span>
            </Link>
            {isOwner && <InlineScheduleManager
              schedule={schedule}
              items={(items ?? []).filter((item) => item.schedule_id === schedule.id).map((item) => ({ ...item, notes: notesByItem.get(item.id) ?? "" }))}
              songs={songs ?? []}
              returnTo="/slides"
            />}
          </article>)}
        </div> : <div className="empty-state">There are no {isOwner ? "presentations" : "published presentations"} yet.</div>}
        {(page > 1 || hasNextPage) && <nav className="list-pagination" aria-label="Slides pages">
          {page > 1 && <Link className="button button-secondary" href={`/slides?page=${page - 1}`}>Newer services</Link>}
          {hasNextPage && <Link className="button button-secondary" href={`/slides?page=${page + 1}`}>Older services</Link>}
        </nav>}
      </div>
    </>
  );
}
