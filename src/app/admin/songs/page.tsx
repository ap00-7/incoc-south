import Link from "next/link";
import { connection } from "next/server";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export default async function AdminSongsPage() {
  await connection();
  if (!isSupabaseConfigured()) return null;
  const membership = await getMembership();
  if (!membership) return null;
  const supabase = await createClient();
  const { data: songs, error } = await supabase.from("songs")
    .select("id, title, language, author, updated_at")
    .eq("church_id", membership.churchId).order("title").limit(100);
  if (error) throw new Error(`Unable to load songs: ${error.message}`);
  return <>
    <p className="eyebrow">LIBRARY</p>
    <div className="admin-title-row"><h1>Manage songs</h1><Link className="button button-primary" href="/admin/songs/new"><Plus size={16} /> Add a song</Link></div>
    <p>Each song lives once in the library and can be reused across services.</p>
    {songs?.length ? <div className="results-list admin-results">{songs.map((song) => <Link className="result-card" href={`/admin/songs/${song.id}`} key={song.id}><div><h2>{song.title}</h2><p>{song.language}{song.author ? ` · ${song.author}` : ""}</p></div><span className="muted">Edit</span></Link>)}</div> : <div className="empty-state">No songs yet. Add the first song to begin your library.</div>}
  </>;
}
