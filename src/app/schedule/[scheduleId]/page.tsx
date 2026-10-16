import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MonitorPlay } from "lucide-react";
import { connection } from "next/server";
import { PageShell } from "@/components/page-shell";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { requireMember } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeZone: "Asia/Kolkata" });

export default async function ScheduleDetailPage({ params }: { params: Promise<{ scheduleId: string }> }) {
  await connection();
  if (!isSupabaseConfigured()) {
    return <PageShell><div className="content-wrap"><div className="notice notice-warning">Service details require a configured Supabase project.</div></div></PageShell>;
  }
  const { scheduleId } = await params;
  const membership = await requireMember();
  const supabase = await createClient();
  const { data: schedule, error } = await supabase.from("schedules")
    .select("id, title, service_date, venue, description, status, schedule_items(id, item_type, title, position, leader_name, duration_minutes, public_content, song_id, song:songs(id, title))")
    .eq("id", scheduleId).eq("church_id", membership.churchId).maybeSingle();
  if (error) throw new Error(`Unable to load service: ${error.message}`);
  if (!schedule || (schedule.status !== "published" && membership.role !== "owner")) notFound();
  const items = [...(schedule.schedule_items ?? [])].sort((a, b) => a.position - b.position);
  const totalMinutes = items.reduce((total, item) => total + (item.duration_minutes ?? 0), 0);

  return (
    <PageShell>
      <RealtimeRefresh subscriptions={[
        { table: "schedules", column: "id", value: scheduleId },
        { table: "schedule_items", column: "schedule_id", value: scheduleId },
        ...items.flatMap((item) => item.song_id ? [
          { table: "songs" as const, column: "id", value: item.song_id },
          { table: "song_sections" as const, column: "song_id", value: item.song_id },
        ] : []),
        { table: "church_members", column: "user_id", value: membership.user.id },
      ]} />
      <article className="content-wrap">
        <Link href="/schedule" className="back-link"><ArrowLeft size={15} /> Back to services</Link>
        <p className="eyebrow">SERVICE PROGRAMME {schedule.status === "draft" ? "· DRAFT" : ""}</p>
        <h1 className="detail-title">{schedule.title}</h1>
        <div className="detail-meta">{dateFormatter.format(new Date(`${schedule.service_date}T12:00:00+05:30`))}{schedule.venue && <span>· {schedule.venue}</span>}</div>
        {schedule.description && <p className="section-description">{schedule.description}</p>}
        {items.length ? <ol className="programme-list">
          {items.map((item, index) => {
            const song = Array.isArray(item.song) ? item.song[0] : item.song;
            return <li className="programme-item" key={item.id}>
            <span className="programme-position">{String(index + 1).padStart(2, "0")}</span>
            <div><h2>{song?.title ?? item.title}</h2><p>{item.item_type.replaceAll("_", " ")}{item.leader_name ? ` · Led by ${item.leader_name}` : ""}</p>{item.public_content && <p>{item.public_content}</p>}</div>
            {item.duration_minutes != null && <span className="programme-duration">{item.duration_minutes} min</span>}
          </li>;
          })}
        </ol> : <div className="empty-state" style={{ marginTop: 22 }}>The programme has not been added yet.</div>}
        {totalMinutes > 0 && <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>Estimated duration: {Math.floor(totalMinutes / 60) ? `${Math.floor(totalMinutes / 60)} hr ` : ""}{totalMinutes % 60} min</p>}
        <div className="schedule-actions"><Link className="button button-primary" href={`/schedule/${schedule.id}/slides`}><MonitorPlay size={16} /> Open slides</Link></div>
      </article>
    </PageShell>
  );
}
