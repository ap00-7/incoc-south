import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { connection } from "next/server";
import { PageShell, SectionHeading } from "@/components/page-shell";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getPublicChurchContext } from "@/lib/supabase/public-content";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "long",
  timeZone: "Asia/Kolkata",
});

export default async function SchedulePage() {
  await connection();
  if (!isSupabaseConfigured()) {
    return <PageShell><div className="content-wrap"><SectionHeading eyebrow="SUNDAY SERVICES" title="Gather together" /><div className="notice notice-warning">Published service schedules will appear here after Supabase is configured.</div></div></PageShell>;
  }
  const { supabase, churchId } = await getPublicChurchContext();
  const { data: schedules, error } = await supabase.from("schedules")
      .select("id, title, service_date, venue, description, church:churches!inner(slug)")
      .eq("church.slug", "incoc-south").eq("status", "published")
      .order("service_date", { ascending: false }).limit(50);
  if (error) throw new Error(`Unable to load services: ${error.message}`);

  return (
    <PageShell>
      <RealtimeRefresh subscriptions={[
        { table: "schedules", column: "church_id", value: churchId },
      ]} />
      <div className="content-wrap">
        <SectionHeading eyebrow="SUNDAY SERVICES" title="Gather together" description="Find the published service plans shared with your church." />
        {schedules?.length ? <div className="results-list">
          {schedules.map((schedule) => <Link className="result-card" href={`/schedule/${schedule.id}`} key={schedule.id}>
            <div><h2>{schedule.title}</h2><p><CalendarDays size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />{dateFormatter.format(new Date(`${schedule.service_date}T12:00:00+05:30`))}{schedule.venue ? ` · ${schedule.venue}` : ""}</p></div>
            <ArrowRight size={17} aria-hidden="true" />
          </Link>)}
        </div> : <div className="empty-state">There are no published services to show yet.</div>}
      </div>
    </PageShell>
  );
}
