"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { SongEditorForm } from "@/components/admin/song-creation-form";
import { deleteSong } from "@/app/admin/actions";
import { getCachedSong, getCachedSongSummary, invalidateSongCache, loadSong, type CachedSong } from "@/lib/song-cache";
import { labelSongSections, sequenceSongSections } from "@/lib/domain/slides";

export function SongPageContent({
  songId,
  isOwner,
  updatedAt,
  editOpen,
}: {
  songId: string;
  isOwner: boolean;
  updatedAt: string;
  editOpen: boolean;
}) {
  const [result, setResult] = useState<{ songId: string; updatedAt: string; song: CachedSong | null; error: string } | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const refreshSong = useCallback(() => {
    invalidateSongCache(songId);
    setResult(null);
    setRefreshVersion((current) => current + 1);
  }, [songId]);

  useEffect(() => {
    const cachedSong = getCachedSong(songId, updatedAt);
    if (cachedSong) return;
    let active = true;
    void loadSong(songId, updatedAt).then((result) => {
      if (active) setResult({ songId, updatedAt, song: result, error: "" });
    }).catch((loadError: unknown) => {
      if (active) setResult({
        songId,
        updatedAt,
        song: null,
        error: loadError instanceof Error ? loadError.message : "Unable to load song.",
      });
    });
    return () => { active = false; };
  }, [songId, isOwner, updatedAt, refreshVersion]);

  const cachedSong = getCachedSong(songId, updatedAt);
  const currentResult = result?.songId === songId && result.updatedAt === updatedAt ? result : null;
  const song = cachedSong ?? currentResult?.song ?? null;
  const error = currentResult?.error ?? "";
  if (error) return <article className="content-wrap"><p className="notice notice-warning" role="alert">{error}</p></article>;
  if (currentResult && !currentResult.song) return <article className="content-wrap">
    <p className="empty-state" role="status">This song is no longer available. <Link href="/song">Return to the Songbook</Link></p>
  </article>;
  if (!song || song.updated_at !== updatedAt) {
    const summary = getCachedSongSummary(songId, updatedAt);
    return <article className="content-wrap" role="status" aria-busy="true">
      <p className="muted">Loading song…</p>
      {summary && <h1 className="detail-title">{summary.title}</h1>}
    </article>;
  }

  const labeledSections = labelSongSections(sequenceSongSections(song.song_sections ?? [], song.start_with_chorus));
  const translatedSections = song.has_translation ? labeledSections.filter(({ section }) => section.translation?.trim()) : [];
  return (
    <>
      <RealtimeRefresh
        subscriptions={[
          { table: "songs", column: "id", value: songId },
          { table: "song_sections", column: "song_id", value: songId },
        ]}
        onChange={refreshSong}
      />
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
        {isOwner && <div id="owner-edit" className="inline-owner-area">
          <details className="inline-owner-editor" open={editOpen}>
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
            <ConfirmButton
              action={deleteSong}
              title="Delete song?"
              message="This permanently deletes the song from the Songbook. A song used by a schedule cannot be deleted."
              className="button button-danger"
              pendingLabel="Deleting…"
              onActionSuccess={() => invalidateSongCache(song.id)}
            >
              Delete song
            </ConfirmButton>
          </form>
        </div>}
      </article>
    </>
  );
}
