import Link from "next/link";
import { connection } from "next/server";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";

const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" });

export default async function AdminSchedulesPage() {
  await connection();
  if (!isSupabaseConfigured()) return null;
  const membership = await getMembership();
  if (!membership) return null;
  const supabase = await createClient();
  const { data: schedules, error } = await supabase.from("schedules")
    .select("id, title, service_date, venue, status")
    .eq("church_id", membership.churchId).order("service_date", { ascending: false }).limit(100);
  if (error) throw new Error(`Unable to load schedules: ${error.message}`);
  return <>
    <p className="eyebrow">SERVICE PLANNING</p>
    <div className="admin-title-row"><h1>Schedules</h1><Link className="button button-primary" href="/admin/schedules/new"><Plus size={16} /> Plan a service</Link></div>
    <p>Each schedule is a dated gathering. Drafts stay private until published.</p>
    {schedules?.length ? <div className="results-list admin-results">{schedules.map((schedule) => <Link className="result-card" href={`/admin/schedules/${schedule.id}`} key={schedule.id}>
      <div><h2>{schedule.title}</h2><p>{dateFormatter.format(new Date(`${schedule.service_date}T12:00:00+05:30`))}{schedule.venue ? ` · ${schedule.venue}` : ""}</p></div><span className={`status-pill status-${schedule.status}`}>{schedule.status}</span>
    </Link>)}</div> : <div className="empty-state">No service schedules yet. Create a draft to start planning.</div>}
  </>;
}
