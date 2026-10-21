import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageContentLoading, PageShell } from "@/components/page-shell";
import { hasSupabaseAuthCookie, getMembership } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { SongPageContent } from "@/components/song-page-content";

type Props = { params: Promise<{ songId: string }>; searchParams: Promise<{ edit?: string }> };

export default function SongPage({ params, searchParams }: Props) {
  return (
    <PageShell>
      <Suspense fallback={<PageContentLoading title="Loading song" />}>
        <SongContent params={params} searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function SongContent({ params, searchParams }: Props) {
  await connection();
  if (!isSupabaseConfigured()) {
    return <div className="content-wrap"><div className="notice notice-warning">Songbook access requires a configured Supabase project.</div></div>;
  }
  const [{ songId }, routeParams] = await Promise.all([params, searchParams]);
  const [supabase, hasAuthCookie] = await Promise.all([createClient(), hasSupabaseAuthCookie()]);
  const [membership, { data: song, error }] = await Promise.all([
    hasAuthCookie ? getMembership(supabase) : Promise.resolve(null),
    supabase.from("songs").select("is_published, updated_at, church:churches!inner(slug)")
      .eq("id", songId).eq("church.slug", "incoc-south").maybeSingle(),
  ]);
  if (error) throw new Error(`Unable to load song: ${error.message}`);
  if (!song) notFound();
  const isOwner = membership?.role === "owner";
  if (!song.is_published && !isOwner) notFound();

  return (
    <SongPageContent songId={songId} isOwner={isOwner} updatedAt={song.updated_at} editOpen={routeParams.edit === "1"} />
  );
}
