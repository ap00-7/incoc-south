import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { IntentPrefetchLink } from "@/components/intent-prefetch-link";
import { deleteSong } from "@/lib/actions/content";
import { labelSongSections, sequenceSongSections } from "@/lib/domain/slides";

const SongEditorForm = lazy(() => import("@/components/admin/song-creation-form").then((module) => ({ default: module.SongEditorForm })));

type SongForReading = {
  id: string;
  updated_at: string;
  title: string;
  language: string;
  author: string | null;
  source: string | null;
  has_translation: boolean;
  start_with_chorus: boolean;
  song_sections: Array<{
    id: string;
    section_type: string;
    label: string | null;
    position: number;
    lyrics: string;
    translation: string | null;
    translation_language: string | null;
    is_hidden: boolean;
  }>;
};

export function SongPageContent({
  song,
  isOwner,
  editOpen,
}: {
  song: SongForReading;
  isOwner: boolean;
  editOpen: boolean;
}) {
  const location = useLocation();
  const navigationState = location.state as { songOrigin?: string; scheduleId?: string } | null;
  const scheduleId = navigationState?.songOrigin === "schedule" && typeof navigationState.scheduleId === "string" && navigationState.scheduleId
    ? navigationState.scheduleId
    : undefined;
  const backHref = scheduleId ? `/schedule/${encodeURIComponent(scheduleId)}` : "/songs";
  const backState = scheduleId ? undefined : { restoreSongbook: true };
  const backLabel = scheduleId ? "Back to Schedule" : "Back to Songbook";
  const returnLabel = scheduleId ? "Return to Schedule" : "Return to Songbook";

  const labeledSections = labelSongSections(sequenceSongSections(song.song_sections ?? [], song.start_with_chorus));
  const translatedSections = song.has_translation ? labeledSections.filter(({ section }) => section.translation?.trim()) : [];
  return (
    <>
      <article className="content-wrap song-reading">
        <IntentPrefetchLink href={backHref} state={backState} className="back-link"><ArrowLeft size={15} /> {backLabel}</IntentPrefetchLink>
        <div className="song-lyrics-display">
          <h1 className="detail-title">{song.title}</h1>
          {labeledSections.some(({ section }) => section.lyrics.trim()) ? labeledSections.filter(({ section }) => section.lyrics.trim()).map(({ section, label }, index) => (
            <section className="lyrics-section" key={`${section.id}-${index}`}>
              <h2>[{label}]</h2>
              <p className="lyrics-text">{section.lyrics}</p>
            </section>
          )) : <div className="empty-state" style={{ marginTop: 25 }}>No lyric sections have been added to this song yet.</div>}
          {translatedSections.length > 0 && <hr className="song-reading-divider" />}
          {translatedSections.length > 0 && <section className="song-translation-section" aria-label="Song translation">
            {translatedSections.map(({ section, label }, index) => <div className="translation-entry" key={`${section.id}-${index}`}>
              <h3>[{label}]</h3>
              {section.translation_language && <p className="translation-language">{section.translation_language}</p>}
              <p className="lyrics-text">{section.translation}</p>
            </div>)}
          </section>}
        </div>
        {isOwner && <div id="owner-edit" className="inline-owner-area">
          <details className="inline-owner-editor" open={editOpen}>
            <summary>Edit song sections and translations</summary>
            <Suspense fallback={<p className="muted" role="status">Loading song editor…</p>}>
              <SongEditorForm
                returnTo={`/songs/${song.id}?edit=1#owner-edit`}
                song={{
                  id: song.id,
                  updated_at: song.updated_at,
                  title: song.title,
                  language: song.language,
                  author: song.author,
                  source: song.source,
                  has_translation: song.has_translation,
                  start_with_chorus: song.start_with_chorus,
                  sections: song.song_sections.map((section) => ({
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
            </Suspense>
          </details>
          <form className="delete-song-form">
            <input type="hidden" name="song_id" value={song.id} />
            <input type="hidden" name="return_to" value="/songs" />
            <ConfirmButton
              action={deleteSong}
              title="Delete song?"
              message="This permanently deletes the song from the Songbook. A song used by a schedule cannot be deleted."
              className="button button-danger"
              pendingLabel="Deleting…"
            >
              Delete song
            </ConfirmButton>
          </form>
        </div>}
      </article>
    </>
  );
}
