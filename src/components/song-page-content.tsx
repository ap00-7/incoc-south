import { useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { IntentPrefetchLink } from "@/components/intent-prefetch-link";
import { labelSongSections, sequenceSongSections } from "@/lib/domain/slides";
import { isMultilingualSong } from "@/lib/domain/songs";

type SongForReading = {
  title: string;
  language: string;
  has_translation: boolean;
  start_with_chorus: boolean;
  song_sections: Array<{
    id: string;
    section_type: string;
    label: string | null;
    position: number;
    lyrics: string;
    lyrics_language: string | null;
    translation: string | null;
    translation_language: string | null;
    is_hidden: boolean;
  }>;
};

export function SongPageContent({ song }: { song: SongForReading }) {
  const location = useLocation();
  const navigationState = location.state as { songOrigin?: string; scheduleId?: string } | null;
  const scheduleId = navigationState?.songOrigin === "schedule" && typeof navigationState.scheduleId === "string" && navigationState.scheduleId
    ? navigationState.scheduleId
    : undefined;
  const backHref = scheduleId ? `/schedule/${encodeURIComponent(scheduleId)}` : "/songs";
  const backState = scheduleId ? undefined : { restoreSongbook: true };
  const backLabel = scheduleId ? "Back to Schedule" : "Back to Songbook";
  const returnLabel = scheduleId ? "Return to Schedule" : "Return to Songbook";

  const isMultilingual = isMultilingualSong(song.language, song.song_sections ?? []);
  const lyricLanguages = new Set([
    song.language,
    ...song.song_sections
      .filter(({ lyrics }) => lyrics.trim())
      .map(({ lyrics_language }) => lyrics_language)
      .filter((language): language is string => Boolean(language)),
  ]);
  const preserveSectionOrder = song.language === "Multilingual" || lyricLanguages.size > 1;
  const labeledSections = labelSongSections(sequenceSongSections(
    song.song_sections ?? [],
    song.start_with_chorus,
    preserveSectionOrder,
  ));
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
              {isMultilingual && section.lyrics_language && <p className="translation-language">{section.lyrics_language}</p>}
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
      </article>
    </>
  );
}
