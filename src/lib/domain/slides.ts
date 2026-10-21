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
  background_image_url?: string | null;
  media_url?: string | null;
  song?: {
    id?: string;
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
  const bridges = uniqueSections(ordered.filter((section) => section.section_type === "bridge"));
  const bridge = bridges[0];
  const endingSections = bridge
    ? [preChorus, chorus].filter(
        (section): section is LyricSection => Boolean(section && section.position > bridge.position),
      )
    : [];
  const sequence: LyricSection[] = [];

  if (startWithChorus && chorus) sequence.push(chorus);
  for (const section of ordered) {
    if (section.section_type === "bridge" || section === preChorus || section === chorus) continue;
    if (section.section_type === "pre_chorus" && preChorus && hasSameSectionContent(section, preChorus)) continue;
    if (section.section_type === "chorus" && chorus && hasSameSectionContent(section, chorus)) continue;
    sequence.push(section);
    if (section.section_type === "verse") {
      if (preChorus) sequence.push(preChorus);
      if (chorus) sequence.push(chorus);
    }
  }

  if (verses.length === 0) {
    if (preChorus) sequence.splice(startWithChorus && chorus ? 1 : 0, 0, preChorus);
    if (chorus && !startWithChorus) sequence.push(chorus);
  }
  sequence.push(...bridges);
  sequence.push(...endingSections);
  return sequence;
}

function hasSameSectionContent(first: LyricSection, second: LyricSection) {
  return first.lyrics.trim() === second.lyrics.trim()
    && (first.translation?.trim() ?? "") === (second.translation?.trim() ?? "")
    && (first.translation_language ?? "") === (second.translation_language ?? "");
}

function uniqueSections(sections: LyricSection[]) {
  return sections.filter((section, index) => !sections.slice(0, index)
    .some((previous) => hasSameSectionContent(section, previous)));
}

export function getSectionDisplayLabel(
  section: Pick<LyricSection, "section_type" | "label">,
  verseNumber?: number,
) {
  const label = section.label?.trim() ?? "";
  if (section.section_type === "verse") {
    return `Verse ${verseNumber ?? 1}`;
  }

  const canonicalLabel: Record<string, string> = {
    pre_chorus: "Pre-Chorus",
    chorus: "Chorus",
    bridge: "Bridge",
  };
  const canonical = canonicalLabel[section.section_type];
  if (canonical) return canonical;
  return label || section.section_type.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

export function labelSongSections(sections: LyricSection[]) {
  let verseNumber = 0;
  return sections.map((section) => ({
    section,
    label: getSectionDisplayLabel(section, section.section_type === "verse" ? ++verseNumber : undefined),
  }));
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
  itemHeader: string | null;
  itemSubtitle: string | null;
  backgroundImageUrl: string | null;
  mediaUrl: string | null;
  sectionLabel: string | null;
  lines: string[];
  translationLines: string[] | null;
  translationLabel: string | null;
  fontScale: number;
};

const LINES_PER_SLIDE = 6;
const TARGET_LINE_LENGTH = 52;

const excludedPresentationTitles = new Set([
  "preservicemeeting",
  "welcomeprayer",
  "welcomeandprayer",
  "sermoncommunion",
  "sermonandcommunion",
  "closingprayer",
]);

export function filterPresentationItems(items: ProgrammeItem[]) {
  return [...items]
    .filter((item) => !excludedPresentationTitles.has(item.title.toLocaleLowerCase().replace(/[^a-z0-9]/g, "")))
    .sort((a, b) => a.position - b.position);
}

function splitSlideLines(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const chunks: string[][] = [];
  for (let start = 0; start < lines.length; start += LINES_PER_SLIDE) {
    chunks.push(lines.slice(start, start + LINES_PER_SLIDE));
  }
  return chunks;
}

export function generateSlides(items: ProgrammeItem[]): PresentationSlide[] {
  const slides: PresentationSlide[] = [];
  for (const item of filterPresentationItems(items)) {
    if (item.song) {
      const songTitle = item.song.title;
      const sections = sequenceSongSections(
        item.song.song_sections,
        item.song.start_with_chorus,
      );
      const labeledSections = labelSongSections(sections);
      const addSectionSlides = (section: LyricSection, label: string) => {
        const originalChunks = section.lyrics.trim() ? splitSlideLines(section.lyrics) : [];
        const translation = item.song?.has_translation === false ? "" : section.translation?.trim() ?? "";
        const translationChunks = translation ? splitSlideLines(translation) : [];
        const slideCount = Math.max(originalChunks.length, translationChunks.length);
        for (let index = 0; index < slideCount; index += 1) {
          const lines = originalChunks[index] ?? [];
          const translationLines = translationChunks[index] ?? [];
          const longest = Math.max(0, ...[...lines, ...translationLines].map((line) => [...line].length));
          slides.push({
            itemId: item.id,
            itemTitle: songTitle,
            itemHeader: item.title && item.title !== songTitle ? item.title : null,
            itemSubtitle: null,
            backgroundImageUrl: item.background_image_url ?? null,
            mediaUrl: item.media_url ?? null,
            sectionLabel: label,
            lines,
            translationLines: translationLines.length ? translationLines : null,
            translationLabel: translationLines.length ? section.translation_language || "Translation" : null,
            fontScale: Math.max(0.58, Math.min(1, TARGET_LINE_LENGTH / longest || 1)),
          });
        }
      };
      for (const { section, label } of labeledSections) {
        addSectionSlides(section, label);
      }
    } else {
      const content = item.public_content?.trim();
      slides.push({
        itemId: item.id,
        itemTitle: item.title,
        itemHeader: null,
        itemSubtitle: null,
        backgroundImageUrl: item.background_image_url ?? null,
        mediaUrl: item.media_url ?? null,
        sectionLabel: null,
        lines: content ? content.replace(/\r\n/g, "\n").split("\n") : [],
        translationLines: null,
        translationLabel: null,
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
