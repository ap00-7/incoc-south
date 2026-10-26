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
  show_in_slides?: boolean;
  show_in_schedule?: boolean | null;
  background_image_url?: string | null;
  media_url?: string | null;
  presentation_file_name?: string | null;
  presentation_mime_type?: string | null;
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
  itemType: string;
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
  presentationFileName?: string | null;
  presentationMimeType?: string | null;
};

export type PresentationSlideGroup = {
  itemId: string;
  itemType: string;
  itemTitle: string;
  itemSubtitle: string | null;
  content: string | null;
  mediaUrl: string | null;
  backgroundImageUrl: string | null;
  firstSlideIndex: number;
  slides: PresentationSlide[];
  presentationFileName?: string | null;
  presentationMimeType?: string | null;
};

export function groupPresentationSlides(slides: PresentationSlide[]): PresentationSlideGroup[] {
  const groups = new Map<string, PresentationSlideGroup>();
  slides.forEach((slide, index) => {
    const group = groups.get(slide.itemId);
    if (group) {
      group.slides.push(slide);
    } else {
      groups.set(slide.itemId, {
        itemId: slide.itemId,
        itemType: slide.itemType,
        itemTitle: slide.itemHeader ?? slide.itemTitle,
        itemSubtitle: slide.itemType === "song" && slide.itemHeader ? slide.itemTitle : null,
        content: slide.itemType === "song" ? null : slide.lines.join("\n"),
        mediaUrl: slide.mediaUrl,
        backgroundImageUrl: slide.backgroundImageUrl,
        firstSlideIndex: index,
        slides: [slide],
        presentationFileName: slide.presentationFileName ?? null,
        presentationMimeType: slide.presentationMimeType ?? null,
      });
    }
  });
  return [...groups.values()];
}

export function getAdjacentItemSlideIndex(
  slides: PresentationSlide[],
  currentIndex: number,
  direction: -1 | 1,
) {
  const currentItemId = slides[currentIndex]?.itemId;
  if (!currentItemId) return null;

  let targetIndex = currentIndex + direction;
  while (targetIndex >= 0 && targetIndex < slides.length && slides[targetIndex].itemId === currentItemId) {
    targetIndex += direction;
  }
  if (targetIndex < 0 || targetIndex >= slides.length) return null;

  const targetItemId = slides[targetIndex].itemId;
  while (direction < 0 && targetIndex > 0 && slides[targetIndex - 1].itemId === targetItemId) {
    targetIndex -= 1;
  }
  return targetIndex;
}

export function getTouchSwipeSlideIndex(
  slides: Array<Pick<PresentationSlide, "itemId">>,
  currentIndex: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  const currentItemId = slides[currentIndex]?.itemId;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  if (!currentItemId || Math.abs(deltaX) < 55 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return null;
  const targetIndex = currentIndex + (deltaX < 0 ? 1 : -1);
  return slides[targetIndex]?.itemId === currentItemId ? targetIndex : null;
}

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
    .filter((item) => item.show_in_slides === true
      || (item.show_in_slides !== false && !excludedPresentationTitles.has(item.title.toLocaleLowerCase().replace(/[^a-z0-9]/g, ""))))
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

function wrapScriptureLines(lines: string[], maxLength = 64) {
  return lines.flatMap((line) => {
    const wrapped: string[] = [];
    let remaining = line;
    while (remaining.length > maxLength) {
      let breakAt = remaining.lastIndexOf(" ", maxLength);
      if (breakAt < 1) breakAt = maxLength;
      wrapped.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).trimStart();
    }
    wrapped.push(remaining);
    return wrapped;
  });
}

export function generateSlides(items: ProgrammeItem[]): PresentationSlide[] {
  const slides: PresentationSlide[] = [];
  for (const item of filterPresentationItems(items)) {
    const itemSlideStart = slides.length;
    if (item.item_type === "presentation") {
      slides.push({
        itemId: item.id,
        itemType: item.item_type,
        itemTitle: "Presentation",
        itemHeader: null,
        itemSubtitle: null,
        backgroundImageUrl: null,
        mediaUrl: item.media_url ?? null,
        sectionLabel: null,
        lines: [],
        translationLines: null,
        translationLabel: null,
        fontScale: 1,
        presentationFileName: item.presentation_file_name ?? null,
        presentationMimeType: item.presentation_mime_type ?? null,
      });
    } else if (item.item_type === "scripture_reading") {
      const passageLines = wrapScriptureLines((item.public_content ?? "").replace(/\r\n/g, "\n").split("\n"));
      const chunks: string[][] = [];
      for (let index = 0; index < passageLines.length; index += 8) {
        chunks.push(passageLines.slice(index, index + 8));
      }
      for (const lines of chunks.length ? chunks : [[]]) {
        const longest = Math.max(0, ...lines.map((line) => [...line].length));
        const lineScale = 8 / Math.max(8, lines.length);
        const textScale = 64 / Math.max(64, longest);
        slides.push({
          itemId: item.id,
          itemType: item.item_type,
          itemTitle: "Scripture",
          itemHeader: null,
          itemSubtitle: null,
          backgroundImageUrl: item.background_image_url ?? null,
          mediaUrl: null,
          sectionLabel: null,
          lines,
          translationLines: null,
          translationLabel: null,
          fontScale: Math.max(0.45, Math.min(1, lineScale, textScale)),
        });
      }
    } else if (item.song) {
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
            itemType: item.item_type,
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
      if (slides.length === itemSlideStart) {
        slides.push({
          itemId: item.id,
          itemType: item.item_type,
          itemTitle: item.song.title,
          itemHeader: item.title && item.title !== item.song.title ? item.title : null,
          itemSubtitle: null,
          backgroundImageUrl: item.background_image_url ?? null,
          mediaUrl: item.media_url ?? null,
          sectionLabel: null,
          lines: [],
          translationLines: null,
          translationLabel: null,
          fontScale: 1,
        });
      }
    } else {
      const content = item.public_content?.trim();
      slides.push({
        itemId: item.id,
        itemType: item.item_type,
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
