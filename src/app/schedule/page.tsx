import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { connection } from "next/server";
import { PageShell, SectionHeading } from "@/components/page-shell";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { requireMember } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "long",
  timeZone: "Asia/Kolkata",
});

export default async function SchedulePage() {
  await connection();
  if (!isSupabaseConfigured()) {
    return <PageShell><div className="content-wrap"><SectionHeading eyebrow="SUNDAY SERVICES" title="Gather together" /><div className="notice notice-warning">Published service schedules will appear here after Supabase is configured.</div></div></PageShell>;
  }
  const membership = await requireMember();
  const supabase = await createClient();
  const { data: schedules, error } = await supabase.from("schedules")
    .select("id, title, service_date, venue, description")
    .eq("church_id", membership.churchId).eq("status", "published")
    .order("service_date", { ascending: false }).limit(50);
  if (error) throw new Error(`Unable to load services: ${error.message}`);

  return (
    <PageShell>
      <RealtimeRefresh subscriptions={[
        { table: "schedules", column: "church_id", value: membership.churchId },
        { table: "church_members", column: "user_id", value: membership.user.id },
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
