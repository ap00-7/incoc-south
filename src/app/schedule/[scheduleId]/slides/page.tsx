import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, MonitorPlay } from "lucide-react";
import { connection } from "next/server";
import { PageContentLoading, PageShell } from "@/components/page-shell";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { getMembership } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { generateSlides, normalizeProgrammeItems } from "@/lib/domain/slides";

type Props = { params: Promise<{ scheduleId: string }> };

export default function SlidesPage({ params }: Props) {
  return (
    <PageShell>
      <Suspense fallback={<PageContentLoading title="Loading presentation" />}>
        <SlidesContent params={params} />
      </Suspense>
    </PageShell>
  );
}

async function SlidesContent({ params }: Props) {
  await connection();
  if (!isSupabaseConfigured()) {
    return <div className="content-wrap"><div className="notice notice-warning">Presentation preview requires a configured Supabase project.</div></div>;
  }
  const { scheduleId } = await params;
  const supabase = await createClient();
  const { data: schedule, error } = await supabase.from("schedules")
    .select("id, title, status, schedule_items(id, item_type, title, position, public_content, background_image_url, song:songs(id, title, has_translation, start_with_chorus, song_sections(id, section_type, label, position, lyrics, translation, translation_language, is_hidden))), church:churches!inner(slug)")
    .eq("id", scheduleId).eq("church.slug", "incoc-south").maybeSingle();
  if (error) throw new Error(`Unable to load slide preview: ${error.message}`);
  if (!schedule) notFound();
  if (schedule.status !== "published" && (await getMembership(supabase))?.role !== "owner") notFound();
  const slides = generateSlides(normalizeProgrammeItems(schedule.schedule_items ?? []));

  return (
    <>
      <RealtimeRefresh subscriptions={[
        { table: "schedules", column: "id", value: scheduleId },
        { table: "schedule_items", column: "schedule_id", value: scheduleId },
        ...schedule.schedule_items?.flatMap((item) => {
          const song = item.song;
          return song ? [{ table: "song_sections" as const, column: "song_id", value: song.id }] : [];
        }) ?? [],
      ]} />
      <div className="content-wrap">
        <Link href={`/schedule/${scheduleId}`} className="back-link"><ArrowLeft size={15} /> Back to service</Link>
        <h1 className="detail-title">{schedule.title}</h1>
        {slides.length ? <div className="admin-card-grid">
          {slides.map((slide, index) => <article className="preview-card" key={`${slide.itemId}-${index}`}>
            <p>{slide.sectionLabel ?? slide.itemTitle} · {index + 1}</p>
            <h2>{slide.lines.join(" ") || "No display text"}</h2>
          </article>)}
        </div> : <div className="empty-state" style={{ marginTop: 24 }}>Add lyric sections or public content to programme items to generate slides.</div>}
        <div className="schedule-actions"><Link className="button button-primary" href={`/present/${schedule.id}`}><MonitorPlay size={16} /> Present service</Link></div>
      </div>
    </>
  );
}
