export type LyricSection = {
  id: string;
  section_type: string;
  label: string | null;
  position: number;
  lyrics: string;
};

export type ProgrammeItem = {
  id: string;
  item_type: string;
  title: string;
  position: number;
  public_content: string | null;
  song?: {
    title: string;
    song_sections: LyricSection[];
  } | null;
};

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
      const sections = [...item.song.song_sections].sort(
        (a, b) => a.position - b.position,
      );
      for (const section of sections) {
        const lines = section.lyrics.replace(/\r\n/g, "\n").split("\n");
        for (let start = 0; start < lines.length; start += LINES_PER_SLIDE) {
          const chunk = lines.slice(start, start + LINES_PER_SLIDE);
          const longest = Math.max(0, ...chunk.map((line) => [...line].length));
          slides.push({
            itemId: item.id,
            itemTitle: item.song.title,
            sectionLabel:
              section.label?.trim() ||
              section.section_type.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase()),
            lines: chunk,
            fontScale: Math.max(0.58, Math.min(1, TARGET_LINE_LENGTH / longest || 1)),
          });
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
