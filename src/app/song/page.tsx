import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { connection } from "next/server";
import { PageContentLoading, PageShell, SectionHeading } from "@/components/page-shell";
import { hasSupabaseAuthCookie, getMembership } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getPublicChurchContext } from "@/lib/supabase/public-content";
import { songLanguageValues } from "@/lib/domain/songs";
import { SongEditorForm } from "@/components/admin/song-creation-form";
import { SongCacheSeed } from "@/components/song-cache-seed";

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
  const supabase = await createClient();
  const hasAuthCookie = await hasSupabaseAuthCookie();
  let songsQuery = supabase.from("songs")
    .select("id, title, language, author, updated_at, church:churches!inner(id, slug)")
    .eq("church.slug", "incoc-south").order("title").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (query) songsQuery = songsQuery.ilike("title", `%${query}%`);
  if (language) songsQuery = songsQuery.eq("language", language);
  const [membership, { data: songs, error }, { data: languageRows, error: languageError }] = await Promise.all([
    hasAuthCookie ? getMembership(supabase) : Promise.resolve(null),
    songsQuery,
    supabase.from("songs").select("language, church:churches!inner(id, slug)")
      .eq("church.slug", "incoc-south").order("language").limit(1000),
  ]);
  if (error || languageError) {
    return <div className="content-wrap">
      <SectionHeading title="Songbook" />
      <div className="notice notice-warning" role="alert">The Songbook couldn’t load. Check your connection and try again. <Link href="/song">Retry</Link></div>
    </div>;
  }
  const languages = [...new Set([
    ...songLanguageValues,
    ...(languageRows ?? []).map((row) => row.language),
  ])].sort((first, second) => first.localeCompare(second));
  let churchId = songs?.[0]?.church.id ?? languageRows?.[0]?.church.id;
  if (!churchId) {
    try {
      churchId = (await getPublicChurchContext()).churchId;
    } catch {
      return <div className="content-wrap">
        <SectionHeading title="Songbook" />
        <div className="notice notice-warning" role="alert">The Songbook couldn’t connect to its content service. Check your connection and try again. <Link href="/song">Retry</Link></div>
      </div>;
    }
  }
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
      <SongCacheSeed songs={songsForPage.slice(0, PAGE_SIZE)} churchId={churchId} />
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
              <Link className="text-link" href={`/song/${song.id}?edit=1#owner-edit`}>Edit</Link>
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
