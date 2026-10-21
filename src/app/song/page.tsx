import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { connection } from "next/server";
import { PageContentLoading, PageShell, SectionHeading } from "@/components/page-shell";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { hasSupabaseAuthCookie, getMembership } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getPublicChurchContext } from "@/lib/supabase/public-content";
import { songLanguageValues } from "@/lib/domain/songs";
import { SongEditorForm } from "@/components/admin/song-creation-form";
import { setSongPublication } from "@/app/admin/actions";
import { ConfirmButton } from "@/components/confirm-button";

type Props = { searchParams: Promise<{ q?: string; language?: string; page?: string; create?: string }> };
const PAGE_SIZE = 50;

export default function SongbookPage({ searchParams }: Props) {
  return (
    <PageShell>
      <Suspense fallback={<PageContentLoading title="Songbook" />}>
        <SongbookContent searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function SongbookContent({ searchParams }: Props) {
  await connection();
  if (!isSupabaseConfigured()) {
    return <div className="content-wrap"><SectionHeading title="Songbook" /><div className="notice notice-warning">Songbook access is not configured yet. Connect a Supabase project and apply the migration to enable the library.</div></div>;
  }
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const language = params.language?.trim() ?? "";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), 10_000) : 1;
  const { supabase, churchId } = await getPublicChurchContext();
  const hasAuthCookie = await hasSupabaseAuthCookie();
  let songsQuery = supabase.from("songs").select("id, title, language, author, is_published, updated_at")
    .eq("church_id", churchId).order("title").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (query) songsQuery = songsQuery.ilike("title", `%${query}%`);
  if (language) songsQuery = songsQuery.eq("language", language);
  const [membership, { data: songs, error }, { data: languageRows, error: languageError }] = await Promise.all([
    hasAuthCookie ? getMembership(supabase) : Promise.resolve(null),
    songsQuery,
    supabase.from("songs").select("language").eq("church_id", churchId).order("language").limit(1000),
  ]);
  if (error) throw new Error(`Unable to load songs: ${error.message}`);
  if (languageError) throw new Error(`Unable to load song languages: ${languageError.message}`);
  const languages = [...new Set([
    ...songLanguageValues,
    ...(languageRows ?? []).map((row) => row.language),
  ])].sort((first, second) => first.localeCompare(second));
  const songsForPage = songs ?? [];
  const hasNextPage = songsForPage.length > PAGE_SIZE;
  const filters = new URLSearchParams();
  if (query) filters.set("q", query);
  if (language) filters.set("language", language);
  const pageHref = (targetPage: number) => {
    const pageParams = new URLSearchParams(filters);
    pageParams.set("page", String(targetPage));
    return `/song?${pageParams.toString()}`;
  };

  return (
    <>
      <RealtimeRefresh subscriptions={[
        { table: "songs", column: "church_id", value: churchId },
      ]} />
      <div className="content-wrap">
        <SectionHeading title="Songbook" />
        {membership?.role === "owner" && <details className="inline-owner-editor" open={params.create === "1"}>
          <summary>Add a song</summary>
          <SongEditorForm returnTo="/song" />
        </details>}
        <form className="toolbar" action="/song">
          <input className="search-input" name="q" defaultValue={query} placeholder="Search by song title" aria-label="Search songs by title" />
          <select name="language" defaultValue={language} aria-label="Filter by language">
            <option value="">All languages</option>
            {languages.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button className="button button-primary">Search</button>
        </form>
        {songsForPage.length ? <div className="results-list">
          {songsForPage.slice(0, PAGE_SIZE).map((song) => <div className="result-card" key={song.id}>
            <Link className="result-card-main" href={`/song/${song.id}`}>
              <div><h2>{song.title}</h2><p>{song.author ? `${song.author} · ` : ""}{song.language}</p></div>
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            {membership?.role === "owner" && <div className="song-owner-actions">
              <span className={`status-pill status-${song.is_published ? "published" : "draft"}`}>{song.is_published ? "Published" : "Draft"}</span>
              <Link className="text-link" href={`/song/${song.id}?edit=1#owner-edit`}>Edit</Link>
              <form>
                <input type="hidden" name="song_id" value={song.id} />
                <input type="hidden" name="is_published" value={String(!song.is_published)} />
                <input type="hidden" name="expected_updated_at" value={song.updated_at} />
                <input type="hidden" name="return_to" value="/song" />
                <ConfirmButton
                  action={setSongPublication}
                  message={song.is_published ? "Unpublish this song? It will no longer be visible to public visitors." : "Publish this song for public viewing?"}
                  title={song.is_published ? "Unpublish song?" : "Publish song?"}
                  confirmLabel={song.is_published ? "Unpublish" : "Publish"}
                  pendingLabel={song.is_published ? "Unpublishing…" : "Publishing…"}
                  confirmClassName="button button-primary"
                  className="text-link"
                >
                  {song.is_published ? "Unpublish" : "Publish"}
                </ConfirmButton>
              </form>
            </div>}
          </div>)}
        </div> : <div className="empty-state">{query || language ? "No songs match those filters." : "The songbook is ready for its first song."}</div>}
        {(page > 1 || hasNextPage) && <nav className="list-pagination" aria-label="Songbook pages">
          {page > 1 && <Link className="button button-secondary" href={pageHref(page - 1)}>Previous songs</Link>}
          {hasNextPage && <Link className="button button-secondary" href={pageHref(page + 1)}>More songs</Link>}
        </nav>}
      </div>
    </>
  );
}
