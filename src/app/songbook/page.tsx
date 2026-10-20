import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { connection } from "next/server";
import { PageShell, SectionHeading } from "@/components/page-shell";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getPublicChurchContext } from "@/lib/supabase/public-content";
import { songLanguageValues } from "@/lib/domain/songs";

type Props = { searchParams: Promise<{ q?: string; language?: string }> };

export default async function SongbookPage({ searchParams }: Props) {
  await connection();
  if (!isSupabaseConfigured()) {
    return <PageShell><div className="content-wrap"><SectionHeading eyebrow="THE SONGBOOK" title="Songs for worship" /><div className="notice notice-warning">Songbook access is not configured yet. Connect a Supabase project and apply the migration to enable the library.</div></div></PageShell>;
  }
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const language = params.language?.trim() ?? "";
  const { supabase, churchId } = await getPublicChurchContext();
  let songsQuery = supabase.from("songs").select("id, title, language, author")
    .eq("church_id", churchId).order("title").limit(100);
  if (query) songsQuery = songsQuery.ilike("title", `%${query}%`);
  if (language) songsQuery = songsQuery.eq("language", language);
  const [{ data: songs, error }, { data: languageRows, error: languageError }] = await Promise.all([
    songsQuery,
    supabase.from("songs").select("language").eq("church_id", churchId).order("language").limit(200),
  ]);
  if (error) throw new Error(`Unable to load songs: ${error.message}`);
  if (languageError) throw new Error(`Unable to load song languages: ${languageError.message}`);
  const languages = [...new Set([
    ...songLanguageValues,
    ...(languageRows ?? []).map((row) => row.language),
  ])].sort((first, second) => first.localeCompare(second));

  return (
    <PageShell>
      <RealtimeRefresh subscriptions={[
        { table: "songs", column: "church_id", value: churchId },
      ]} />
      <div className="content-wrap">
        <SectionHeading eyebrow="THE SONGBOOK" title="Songs for worship" description="Browse the songs shared by your church. Select a song to read its lyrics and sections." />
        <form className="toolbar" action="/songbook">
          <input className="search-input" name="q" defaultValue={query} placeholder="Search by song title" aria-label="Search songs by title" />
          <select name="language" defaultValue={language} aria-label="Filter by language">
            <option value="">All languages</option>
            {languages.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button className="button button-primary">Search</button>
        </form>
        {songs?.length ? <div className="results-list">
          {songs.map((song) => <Link className="result-card" href={`/songbook/${song.id}`} key={song.id}>
            <div><h2>{song.title}</h2><p>{song.author ? `${song.author} · ` : ""}{song.language}</p></div>
            <ArrowRight size={17} aria-hidden="true" />
          </Link>)}
        </div> : <div className="empty-state">{query || language ? "No songs match those filters." : "The songbook is ready for its first song."}</div>}
      </div>
    </PageShell>
  );
}
