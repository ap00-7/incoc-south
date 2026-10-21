import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { PageContentLoading, PageShell } from "@/components/page-shell";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { hasSupabaseAuthCookie, getMembership } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getPublicChurchContext } from "@/lib/supabase/public-content";
import { labelSongSections, sequenceSongSections } from "@/lib/domain/slides";
import { SongEditorForm } from "@/components/admin/song-creation-form";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteSong } from "@/app/admin/actions";

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
  const { supabase, churchId } = await getPublicChurchContext();
  const hasAuthCookie = await hasSupabaseAuthCookie();
  const [{ data: song, error }, membership] = await Promise.all([
    supabase.from("songs")
      .select("id, title, language, author, source, has_translation, start_with_chorus, is_published, updated_at, song_sections(id, section_type, label, position, lyrics, translation, translation_language, is_hidden)")
      .eq("id", songId).eq("church_id", churchId).maybeSingle(),
    hasAuthCookie ? getMembership(supabase) : Promise.resolve(null),
  ]);
  if (error) throw new Error(`Unable to load song: ${error.message}`);
  if (!song) notFound();
  const sections = sequenceSongSections(song.song_sections ?? [], song.start_with_chorus);
  const labeledSections = labelSongSections(sections);
  const translatedSections = song.has_translation ? labeledSections.filter(({ section }) => section.translation?.trim()) : [];

  return (
    <>
      <RealtimeRefresh subscriptions={[
        { table: "songs", column: "id", value: songId },
        { table: "song_sections", column: "song_id", value: songId },
      ]} />
      <article className="content-wrap song-reading">
        <Link href="/song" className="back-link"><ArrowLeft size={15} /> Back to Songbook</Link>
        <h1 className="detail-title">{song.title}</h1>
        <hr className="song-reading-divider" />
        {labeledSections.some(({ section }) => section.lyrics.trim()) ? labeledSections.filter(({ section }) => section.lyrics.trim()).map(({ section, label }, index) => (
          <section className="lyrics-section" key={`${section.id}-${index}`}>
            <h2>[{label}]</h2>
            <p className="lyrics-text">{section.lyrics}</p>
          </section>
        )) : <div className="empty-state" style={{ marginTop: 25 }}>No lyric sections have been added to this song yet.</div>}
        {translatedSections.length > 0 && <section className="song-translation-section" aria-label="Song translation">
          <h2>Translation</h2>
          {translatedSections.map(({ section, label }, index) => <div className="translation-entry" key={`${section.id}-${index}`}>
            <h3>[{label}]</h3>
            {section.translation_language && <p className="translation-language">{section.translation_language}</p>}
            <p className="lyrics-text">{section.translation}</p>
          </div>)}
        </section>}
        {membership?.role === "owner" && <div id="owner-edit" className="inline-owner-area">
          <details className="inline-owner-editor" open={routeParams.edit === "1"}>
            <summary>Edit song sections and translations</summary>
            <SongEditorForm
              returnTo={`/song/${song.id}?edit=1#owner-edit`}
              song={{
                id: song.id,
                updated_at: song.updated_at,
                title: song.title,
                language: song.language,
                author: song.author,
                source: song.source,
                has_translation: song.has_translation,
                start_with_chorus: song.start_with_chorus,
                is_published: song.is_published,
                sections: (song.song_sections ?? []).sort((first, second) => first.position - second.position).map((section) => ({
                  id: section.id,
                  section_type: section.section_type,
                  label: section.label ?? "",
                  lyrics: section.lyrics,
                  translation: section.translation ?? "",
                  translation_language: section.translation_language ?? "",
                  is_hidden: section.is_hidden,
                })),
              }}
            />
          </details>
          <form className="delete-song-form">
            <input type="hidden" name="song_id" value={song.id} />
            <input type="hidden" name="return_to" value="/song" />
            <ConfirmButton action={deleteSong} title="Delete song?" message="This permanently deletes the song from the Songbook. A song used by a schedule cannot be deleted." className="button button-danger" pendingLabel="Deleting…">Delete song</ConfirmButton>
          </form>
        </div>}
      </article>
    </>
  );
}
