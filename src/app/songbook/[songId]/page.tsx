import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { requireMember } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export default async function SongPage({ params }: { params: Promise<{ songId: string }> }) {
  await connection();
  if (!isSupabaseConfigured()) {
    return <PageShell><div className="content-wrap"><div className="notice notice-warning">Songbook access requires a configured Supabase project.</div></div></PageShell>;
  }
  const { songId } = await params;
  const membership = await requireMember();
  const supabase = await createClient();
  const { data: song, error } = await supabase.from("songs")
    .select("id, title, language, author, source, song_sections(id, section_type, label, position, lyrics)")
    .eq("id", songId).eq("church_id", membership.churchId).maybeSingle();
  if (error) throw new Error(`Unable to load song: ${error.message}`);
  if (!song) notFound();
  const sections = [...(song.song_sections ?? [])].sort((a, b) => a.position - b.position);

  return (
    <PageShell>
      <RealtimeRefresh subscriptions={[
        { table: "songs", column: "id", value: songId },
        { table: "song_sections", column: "song_id", value: songId },
        { table: "church_members", column: "user_id", value: membership.user.id },
      ]} />
      <article className="content-wrap">
        <Link href="/songbook" className="back-link"><ArrowLeft size={15} /> Back to songbook</Link>
        <p className="eyebrow">WORSHIP SONG</p>
        <h1 className="detail-title">{song.title}</h1>
        <div className="detail-meta"><span className="meta-tag">{song.language}</span>{song.author && <span>Written by {song.author}</span>}{song.source && <span>· {song.source}</span>}</div>
        {sections.length ? sections.map((section) => (
          <section className="lyrics-section" key={section.id}>
            <h2>{section.label?.trim() || section.section_type.replaceAll("_", " ")}</h2>
            <p className="lyrics-text">{section.lyrics}</p>
          </section>
        )) : <div className="empty-state" style={{ marginTop: 25 }}>No lyric sections have been added to this song yet.</div>}
      </article>
    </PageShell>
  );
}
