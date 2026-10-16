import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export default async function AdminPage() {
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const [{ count: songs, error: songsError }, { count: schedules, error: schedulesError }] = await Promise.all([
    supabase.from("songs").select("*", { count: "exact", head: true }),
    supabase.from("schedules").select("*", { count: "exact", head: true }),
  ]);
  if (songsError) throw new Error(`Unable to load song count: ${songsError.message}`);
  if (schedulesError) throw new Error(`Unable to load service count: ${schedulesError.message}`);
  return <>
    <p className="eyebrow">OWNER DASHBOARD</p>
    <h1>Welcome to INCOC South</h1>
    <p>Prepare the next service and care for the songbook from one place.</p>
    <div className="admin-stats"><div><strong>{songs ?? 0}</strong><span>Songs in library</span></div><div><strong>{schedules ?? 0}</strong><span>Service schedules</span></div></div>
    <div className="admin-card-grid">
      <Link className="admin-link-card" href="/admin/songs"><strong>Manage songs</strong><span>Create reusable songs, edit lyric sections, and organize languages.</span></Link>
      <Link className="admin-link-card" href="/admin/schedules"><strong>Plan a service</strong><span>Build a dated programme, preview slides, and publish it for public viewing.</span></Link>
      <Link className="admin-link-card" href="/admin/settings"><strong>Church settings</strong><span>Review application identity and configuration status.</span></Link>
    </div>
  </>;
}
