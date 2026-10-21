import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { connection } from "next/server";
import { PageContentLoading, PageShell } from "@/components/page-shell";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { getMembership } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getPublicChurchContext } from "@/lib/supabase/public-content";

const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeZone: "Asia/Kolkata" });

type Props = { params: Promise<{ scheduleId: string }> };

export default function ScheduleDetailPage({ params }: Props) {
  return (
    <PageShell>
      <Suspense fallback={<PageContentLoading title="Loading service" />}>
        <ScheduleDetailContent params={params} />
      </Suspense>
    </PageShell>
  );
}

async function ScheduleDetailContent({ params }: Props) {
  await connection();
  if (!isSupabaseConfigured()) {
    return <div className="content-wrap"><div className="notice notice-warning">Service details require a configured Supabase project.</div></div>;
  }
  const { scheduleId } = await params;
  const { supabase, churchId } = await getPublicChurchContext();
  const { data: schedule, error } = await supabase.from("schedules")
    .select("id, title, service_date, venue, description, status, schedule_items(id, item_type, title, position, leader_name, translator_name, translation_language, duration_minutes, public_content, link_title, link_url, media_url, background_image_url, song_id, song:songs(id, title))")
    .eq("id", scheduleId).eq("church_id", churchId).maybeSingle();
  if (error) throw new Error(`Unable to load service: ${error.message}`);
  if (!schedule) notFound();
  if (schedule.status !== "published" && (await getMembership(supabase))?.role !== "owner") notFound();
  const items = [...(schedule.schedule_items ?? [])].sort((a, b) => a.position - b.position);

  return (
    <>
      <RealtimeRefresh subscriptions={[
        { table: "schedules", column: "id", value: scheduleId },
        { table: "schedule_items", column: "schedule_id", value: scheduleId },
        ...items.flatMap((item) => item.song_id ? [
          { table: "songs" as const, column: "id", value: item.song_id },
          { table: "song_sections" as const, column: "song_id", value: item.song_id },
        ] : []),
      ]} />
      <article className="content-wrap">
        <Link href="/schedule" className="back-link"><ArrowLeft size={15} /> Back to services</Link>
        <h1 className="detail-title">{schedule.title}</h1>
        <div className="detail-meta">{dateFormatter.format(new Date(`${schedule.service_date}T12:00:00+05:30`))}{schedule.venue && <span>· {schedule.venue}</span>}</div>
        {schedule.description && <p className="section-description">{schedule.description}</p>}
        {items.length ? <ol className="programme-list">
          {items.map((item) => {
            const song = Array.isArray(item.song) ? item.song[0] : item.song;
            const primary = song
              ? <><span>Song: </span><Link className="song-title-link" href={`/songbook/${song.id}`}>{song.title}</Link></>
              : item.leader_name && item.public_content
                ? <>{item.item_type === "song" ? "Song leader: " : "Responsible: "}{item.leader_name} · {item.public_content}</>
              : item.leader_name
                ? <>{item.item_type === "song" ? "Song leader: " : "Responsible: "}{item.leader_name}</>
                : item.public_content || (item.item_type === "scripture_reading" ? "Scripture reading" : item.item_type.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase()));
            const details = [
              song && item.leader_name ? `Song leader: ${item.leader_name}` : null,
              item.duration_minutes != null ? `${item.duration_minutes} min` : null,
              item.translator_name ? `Translator: ${item.translator_name}` : null,
              item.translation_language,
            ].filter(Boolean);
            return <li className="programme-item" key={item.id}>
            <div>
              <h2>{item.title}</h2>
              <p>{primary}</p>
              {(details.length > 0 || item.link_url) && <p>
                {details.join(" · ")}
                {item.link_url && <>{details.length > 0 && " · "}<Link href={item.link_url} target="_blank" rel="noreferrer">{item.link_title || item.link_url}</Link></>}
              </p>}
              {item.background_image_url && <img className="schedule-item-background" src={item.background_image_url} alt={`${item.title} background`} />}
              {item.media_url && (/\.(mp4|webm)(?:$|\?)/i.test(item.media_url)
                ? <video className="schedule-item-media" src={item.media_url} controls preload="metadata" />
                : <img className="schedule-item-media" src={item.media_url} alt={`${item.title} media`} />)}
            </div>
          </li>;
          })}
        </ol> : <div className="empty-state" style={{ marginTop: 22 }}>The programme has not been added yet.</div>}
      </article>
    </>
  );
}
