import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageContentLoading, PageShell, SectionHeading } from "@/components/page-shell";
import { hasSupabaseAuthCookie, getMembership } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getPublicChurchContext } from "@/lib/supabase/public-content";
import { SongEditorForm } from "@/components/admin/song-creation-form";
import { SongCacheSeed } from "@/components/song-cache-seed";
import { CachedSongLink } from "@/components/cached-song-link";
import { SongbookSearch } from "@/components/songbook-search";

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
  const [params, supabase, hasAuthCookie] = await Promise.all([
    searchParams,
    createClient(),
    hasSupabaseAuthCookie(),
  ]);
  const query = params.q?.trim() ?? "";
  const language = params.language?.trim() ?? "";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), 10_000) : 1;
  let songsQuery = supabase.from("songs")
    .select("id, title, language, author, updated_at, church:churches!inner(id, slug)")
    .eq("church.slug", "incoc-south").order("title").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (query) songsQuery = songsQuery.ilike("title", `%${query}%`);
  if (language) songsQuery = songsQuery.eq("language", language);
  const [membership, { data: songs, error }] = await Promise.all([
    hasAuthCookie ? getMembership(supabase) : Promise.resolve(null),
    songsQuery,
  ]);
  if (error) {
    return <div className="content-wrap">
      <SectionHeading title="Songbook" />
      <div className="notice notice-warning" role="alert">The Songbook couldn’t load. Check your connection and try again. <Link href="/song">Retry</Link></div>
    </div>;
  }
  let churchId = songs?.[0]?.church.id;
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
        <SongbookSearch songs={songsForPage.slice(0, PAGE_SIZE)} query={query} language={language} />
        {songsForPage.length ? <div className="results-list">
          {songsForPage.slice(0, PAGE_SIZE).map((song) => <CachedSongLink className="song-title-result" key={song.id} songId={song.id} updatedAt={song.updated_at}>{song.title}</CachedSongLink>)}
        </div> : <div className="empty-state">{query || language ? "No songs match those filters." : "The songbook is ready for its first song."}</div>}
        {(page > 1 || hasNextPage) && <nav className="list-pagination" aria-label="Songbook pages">
          {page > 1 && <Link className="button button-secondary" href={pageHref(page - 1)}>Previous songs</Link>}
          {hasNextPage && <Link className="button button-secondary" href={pageHref(page + 1)}>More songs</Link>}
        </nav>}
      </div>
    </>
  );
}
