import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Image as ImageIcon, MonitorPlay } from "lucide-react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageContentLoading, PageShell, SectionHeading } from "@/components/page-shell";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { hasSupabaseAuthCookie, getMembership } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getPublicChurchContext } from "@/lib/supabase/public-content";
import { IntentPrefetchLink } from "@/components/intent-prefetch-link";
import { generateSlides, normalizeProgrammeItems } from "@/lib/domain/slides";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "long",
  timeZone: "Asia/Kolkata",
});

type Props = { searchParams: Promise<{ page?: string; scheduleId?: string }> };
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
    return <div className="content-wrap"><SectionHeading title="Slides" /><div className="notice notice-warning">Presentations will appear here after Supabase is configured.</div></div>;
  }
  const params = await searchParams;
  const [supabase, hasAuthCookie] = await Promise.all([createClient(), hasSupabaseAuthCookie()]);
  const membershipPromise = hasAuthCookie ? getMembership(supabase) : Promise.resolve(null);
  if (params.scheduleId) {
    const [{ data: schedule, error }, membership] = await Promise.all([
      supabase.from("schedules")
        .select("id, title, service_date, venue, schedule_items(id, item_type, title, position, public_content, background_image_url, media_url, song:songs(id, title, has_translation, start_with_chorus, song_sections(id, section_type, label, position, lyrics, translation, translation_language, is_hidden))), church:churches!inner(slug)")
        .eq("id", params.scheduleId).eq("church.slug", "incoc-south").maybeSingle(),
      membershipPromise,
    ]);
    const isOwner = membership?.role === "owner";
    if (error) throw new Error(`Unable to load slide previews: ${error.message}`);
    if (!schedule) notFound();
    const items = normalizeProgrammeItems(schedule.schedule_items ?? []);
    const slides = generateSlides(items);
    return (
      <>
        <RealtimeRefresh subscriptions={[
          { table: "schedules", column: "id", value: schedule.id },
          { table: "schedule_items", column: "schedule_id", value: schedule.id },
          ...items.flatMap((item) => item.song?.id ? [
            { table: "songs" as const, column: "id", value: item.song.id },
            { table: "song_sections" as const, column: "song_id", value: item.song.id },
          ] : []),
        ]} />
        <div className="content-wrap slides-overview">
          <IntentPrefetchLink href="/slides" className="back-link"><ArrowLeft size={15} /> All services</IntentPrefetchLink>
          <h1 className="detail-title">{schedule.title}</h1>
          <p className="slides-overview-meta">
            <CalendarDays size={15} aria-hidden="true" />
            {dateFormatter.format(new Date(`${schedule.service_date}T12:00:00+05:30`))}
            {schedule.venue && <span>{schedule.venue}</span>}
          </p>
          {slides.length ? <div className="slides-preview-grid">
            {slides.map((slide, index) => {
              const thumbnail = slide.mediaUrl || slide.backgroundImageUrl;
              const preview = [
                slide.lines.join(" "),
                slide.translationLines?.join(" "),
              ].filter(Boolean).join(" · ");
              return (
                <Link className="slides-preview-card" href={`/present/${schedule.id}?slide=${index}`} key={`${slide.itemId}-${index}`}>
                  <div className="slides-preview-media">
                    {thumbnail
                      ? (/\.(mp4|webm)(?:$|\?)/i.test(thumbnail)
                        ? <video src={thumbnail} muted preload="metadata" aria-hidden="true" />
                        : <img src={thumbnail} alt="" loading="lazy" />)
                      : <span><ImageIcon size={22} aria-hidden="true" /></span>}
                    <small>{index + 1} / {slides.length}</small>
                  </div>
                  <div className="slides-preview-copy">
                    <h2>{slide.itemHeader || slide.itemTitle}</h2>
                    {slide.sectionLabel && <span>{slide.sectionLabel}</span>}
                    <p>{preview || "Media or display content"}</p>
                  </div>
                </Link>
              );
            })}
          </div> : <div className="empty-state">There are no presentation slides for this service.</div>}
          {isOwner && <IntentPrefetchLink className="schedule-edit-link" href={`/admin/schedules/${schedule.id}`}>Edit schedule</IntentPrefetchLink>}
        </div>
      </>
    );
  }
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), 10_000) : 1;
  const schedulesQuery = supabase.from("schedules")
    .select("id, title, service_date, venue, description, updated_at, church:churches!inner(id, slug)")
    .eq("church.slug", "incoc-south");
  const [{ data: schedules, error }, membership] = await Promise.all([
    schedulesQuery.order("service_date", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    membershipPromise,
  ]);
  const isOwner = membership?.role === "owner";
  if (error) throw new Error(`Unable to load presentations: ${error.message}`);
  const schedulesForPage = schedules ?? [];
  const churchId = schedulesForPage[0]?.church.id ?? (await getPublicChurchContext()).churchId;
  const hasNextPage = schedulesForPage.length > PAGE_SIZE;
  const visibleSchedules = schedulesForPage.slice(0, PAGE_SIZE);
  return (
    <>
      <RealtimeRefresh subscriptions={[{ table: "schedules", column: "church_id", value: churchId }]} />
      <div className="content-wrap">
        <SectionHeading title="Slides" />
        {visibleSchedules.length ? <div className="results-list">
          {visibleSchedules.map((schedule) => <article className="public-list-entry" key={schedule.id}>
            <IntentPrefetchLink className="result-card" href={`/slides?scheduleId=${schedule.id}`}>
              <div>
                <h2>{schedule.title}</h2>
                <p><CalendarDays size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />{dateFormatter.format(new Date(`${schedule.service_date}T12:00:00+05:30`))}{schedule.venue ? ` · ${schedule.venue}` : ""}</p>
              </div>
              <span className="public-entry-meta"><MonitorPlay size={15} /> View slides <ArrowRight size={15} /></span>
            </IntentPrefetchLink>
            {isOwner && <IntentPrefetchLink className="schedule-edit-link" href={`/admin/schedules/${schedule.id}`}>Edit schedule</IntentPrefetchLink>}
          </article>)}
        </div> : <div className="empty-state">There are no presentations yet.</div>}
        {(page > 1 || hasNextPage) && <nav className="list-pagination" aria-label="Slides pages">
          {page > 1 && <Link className="button button-secondary" href={`/slides?page=${page - 1}`}>Newer services</Link>}
          {hasNextPage && <Link className="button button-secondary" href={`/slides?page=${page + 1}`}>Older services</Link>}
        </nav>}
      </div>
    </>
  );
}
