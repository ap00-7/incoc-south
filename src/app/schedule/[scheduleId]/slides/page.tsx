import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MonitorPlay } from "lucide-react";
import { connection } from "next/server";
import { PageShell } from "@/components/page-shell";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { getMembership } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getPublicChurchContext } from "@/lib/supabase/public-content";
import { generateSlides, normalizeProgrammeItems } from "@/lib/domain/slides";

export default async function SlidesPage({ params }: { params: Promise<{ scheduleId: string }> }) {
  await connection();
  if (!isSupabaseConfigured()) {
    return <PageShell><div className="content-wrap"><div className="notice notice-warning">Presentation preview requires a configured Supabase project.</div></div></PageShell>;
  }
  const { scheduleId } = await params;
  const [membership, { supabase, churchId }] = await Promise.all([
    getMembership(),
    getPublicChurchContext(),
  ]);
  const { data: schedule, error } = await supabase.from("schedules")
    .select("id, title, status, schedule_items(id, item_type, title, position, public_content, song:songs(id, title, song_sections(id, section_type, label, position, lyrics, translation, translation_language)))")
    .eq("id", scheduleId).eq("church_id", churchId).maybeSingle();
  if (error) throw new Error(`Unable to load slide preview: ${error.message}`);
  if (!schedule || (schedule.status !== "published" && membership?.role !== "owner")) notFound();
  const slides = generateSlides(normalizeProgrammeItems(schedule.schedule_items ?? []));

  return (
    <PageShell>
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
        <p className="eyebrow">PRESENTATION PREVIEW</p>
        <h1 className="detail-title">{schedule.title}</h1>
        <p className="section-description">Preview uses the same deterministic slide layout as projector mode. {slides.length} slide{slides.length === 1 ? "" : "s"}.</p>
        {slides.length ? <div className="admin-card-grid">
          {slides.map((slide, index) => <article className="preview-card" key={`${slide.itemId}-${index}`}>
            <p>{slide.sectionLabel ?? slide.itemTitle} · {index + 1}</p>
            <h2>{slide.lines.join(" ") || "No display text"}</h2>
          </article>)}
        </div> : <div className="empty-state" style={{ marginTop: 24 }}>Add lyric sections or public content to programme items to generate slides.</div>}
        <div className="schedule-actions"><Link className="button button-primary" href={`/present/${schedule.id}`}><MonitorPlay size={16} /> Present service</Link></div>
      </div>
    </PageShell>
  );
}
