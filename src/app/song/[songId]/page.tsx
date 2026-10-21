import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageContentLoading, PageShell } from "@/components/page-shell";
import { hasSupabaseAuthCookie, getMembership } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";
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
  if (!songId) notFound();
  const hasAuthCookie = await hasSupabaseAuthCookie();
  const membership = hasAuthCookie ? await getMembership() : null;
  const isOwner = membership?.role === "owner";

  return (
    <SongPageContent songId={songId} isOwner={isOwner} editOpen={routeParams.edit === "1"} />
  );
}
