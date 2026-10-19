export type LyricSection = {
  id: string;
  section_type: string;
  label: string | null;
  position: number;
  lyrics: string;
  is_hidden?: boolean;
  translation?: string | null;
  translation_language?: string | null;
};

export type ProgrammeItem = {
  id: string;
  item_type: string;
  title: string;
  position: number;
  public_content: string | null;
  song?: {
    title: string;
    start_with_chorus?: boolean;
    has_translation?: boolean;
    song_sections: LyricSection[];
  } | null;
};

export function sequenceSongSections(
  sections: LyricSection[],
  startWithChorus = false,
): LyricSection[] {
  const ordered = [...sections].filter((section) => !section.is_hidden && (section.lyrics.trim() || section.translation?.trim()))
    .sort((a, b) => a.position - b.position);
  const chorus = ordered.find((section) => section.section_type === "chorus");
  const preChorus = ordered.find((section) => section.section_type === "pre_chorus");
  const verses = ordered.filter((section) => section.section_type === "verse");
  const sequence: LyricSection[] = [];

  if (startWithChorus && chorus) sequence.push(chorus);
  for (const section of ordered) {
    if (section === chorus || section === preChorus) continue;
    if (section.section_type === "chorus" && chorus
      && section.lyrics.trim() === chorus.lyrics.trim()
      && (section.label?.trim() ?? "") === (chorus.label?.trim() ?? "")
      && (section.translation?.trim() ?? "") === (chorus.translation?.trim() ?? "")
      && (section.translation_language ?? "") === (chorus.translation_language ?? "")) continue;
    sequence.push(section);
    if (section.section_type === "verse") {
      if (preChorus) sequence.push(preChorus);
      if (chorus) sequence.push(chorus);
    }
  }

  if (verses.length === 0) {
    if (preChorus) sequence.push(preChorus);
    if (chorus && !startWithChorus) sequence.push(chorus);
  }
  return sequence;
}

export function normalizeProgrammeItems(
  items: Array<Omit<ProgrammeItem, "song"> & {
    song: NonNullable<ProgrammeItem["song"]> | NonNullable<ProgrammeItem["song"]>[] | null;
  }>,
): ProgrammeItem[] {
  return items.map(({ song, ...item }) => ({
    ...item,
    song: Array.isArray(song) ? song[0] ?? null : song,
  }));
}

export type PresentationSlide = {
  itemId: string;
  itemTitle: string;
  sectionLabel: string | null;
  lines: string[];
  fontScale: number;
};

const LINES_PER_SLIDE = 6;
const TARGET_LINE_LENGTH = 52;

export function generateSlides(items: ProgrammeItem[]): PresentationSlide[] {
  const slides: PresentationSlide[] = [];
  for (const item of [...items].sort((a, b) => a.position - b.position)) {
    if (item.song) {
      const songTitle = item.song.title;
      const sections = sequenceSongSections(
        item.song.song_sections,
        item.song.start_with_chorus,
      );
      const showTranslations = item.song.has_translation !== false;
      const addTextSlides = (text: string, label: string) => {
        const lines = text.replace(/\r\n/g, "\n").split("\n");
        for (let start = 0; start < lines.length; start += LINES_PER_SLIDE) {
          const chunk = lines.slice(start, start + LINES_PER_SLIDE);
          const longest = Math.max(0, ...chunk.map((line) => [...line].length));
          slides.push({
            itemId: item.id,
            itemTitle: songTitle,
            sectionLabel: label,
            lines: chunk,
            fontScale: Math.max(0.58, Math.min(1, TARGET_LINE_LENGTH / longest || 1)),
          });
        }
      };
      for (const section of sections) {
        const sectionLabel = section.label?.trim() || section.section_type.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
        if (section.lyrics.trim()) addTextSlides(section.lyrics, sectionLabel);
      }
      if (showTranslations) {
        for (const section of sections) {
          if (!section.translation?.trim()) continue;
          const sectionLabel = section.label?.trim() || section.section_type.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
          addTextSlides(
            section.translation,
            `${sectionLabel} · ${section.translation_language ?? "Translation"}`,
          );
        }
      }
    } else {
      const content = item.public_content?.trim();
      slides.push({
        itemId: item.id,
        itemTitle: item.title,
        sectionLabel: null,
        lines: content ? content.replace(/\r\n/g, "\n").split("\n") : [],
        fontScale: 1,
      });
    }
  }
  return slides;
}

export function clampSlideIndex(index: number, slideCount: number) {
  if (slideCount <= 0) return 0;
  return Math.min(Math.max(0, index), slideCount - 1);
}
