import { describe, expect, it } from "vitest";
import { clampSlideIndex, generateSlides, sequenceSongSections, type LyricSection, type ProgrammeItem } from "./slides";

const songItem = (
  title: string,
  position: number,
  sections: LyricSection[],
): ProgrammeItem => ({
  id: `item-${position}`,
  item_type: "song",
  title,
  position,
  public_content: null,
  song: { title, song_sections: sections },
});

describe("generateSlides", () => {
  it("orders programme items and sections deterministically", () => {
    const slides = generateSlides([
      songItem("Second", 2, [{ id: "b", section_type: "chorus", label: null, position: 1, lyrics: "Chorus" }]),
      songItem("First", 1, [
        { id: "b", section_type: "chorus", label: null, position: 1, lyrics: "Refrain" },
        { id: "a", section_type: "verse", label: "Verse 1", position: 0, lyrics: "First line" },
      ]),
    ]);
    expect(slides.map((slide) => slide.itemTitle)).toEqual(["First", "First", "Second"]);
    expect(slides[0].lines).toEqual(["First line"]);
    expect(slides[1].sectionLabel).toBe("Chorus");
  });

  it("preserves Unicode, blank lines, and lyric line order while splitting long sections", () => {
    const lines = ["தமிழ் பாடல்", "", "ಸುವಾರ್ತೆ", "తెలుగు పాట", "हिंदी भजन", "English", "Final line"];
    const slides = generateSlides([songItem("Multilingual", 0, [
      { id: "s", section_type: "verse", label: null, position: 0, lyrics: lines.join("\r\n") },
    ])]);
    expect(slides).toHaveLength(2);
    expect(slides.flatMap((slide) => slide.lines)).toEqual(lines);
  });

  it("adds each section translation as separately labeled slides", () => {
    const slides = generateSlides([songItem("Multilingual", 0, [
      {
        id: "s",
        section_type: "chorus",
        label: null,
        position: 0,
        lyrics: "Original chorus",
        translation: "தமிழ் மொழிபெயர்ப்பு",
        translation_language: "Tamil",
      },
    ])]);
    expect(slides.map((slide) => slide.sectionLabel)).toEqual(["Chorus", "Chorus · Tamil"]);
    expect(slides.map((slide) => slide.lines[0])).toEqual(["Original chorus", "தமிழ் மொழிபெயர்ப்பு"]);
  });

  it("repeats the stored chorus after verses and keeps all translations after originals", () => {
    const sections: LyricSection[] = [
      { id: "v1", section_type: "verse", label: "Verse 1", position: 0, lyrics: "Verse one", translation: "Translation one" },
      { id: "p", section_type: "pre_chorus", label: null, position: 1, lyrics: "Lift" },
      { id: "c", section_type: "chorus", label: null, position: 2, lyrics: "Refrain", translation: "Translated refrain" },
      { id: "v2", section_type: "verse", label: "Verse 2", position: 3, lyrics: "Verse two" },
    ];
    expect(sequenceSongSections(sections).map((section) => section.id)).toEqual(["v1", "p", "c", "v2", "p", "c"]);
    const slides = generateSlides([songItem("Sequence", 0, sections)]);
    expect(slides.map((slide) => slide.lines[0])).toEqual([
      "Verse one", "Lift", "Refrain", "Verse two", "Lift", "Refrain",
      "Translation one", "Translated refrain", "Translated refrain",
    ]);
  });

  it("starts with one chorus and excludes hidden sections", () => {
    const sequence = sequenceSongSections([
      { id: "v", section_type: "verse", label: null, position: 0, lyrics: "Verse" },
      { id: "c", section_type: "chorus", label: null, position: 1, lyrics: "Chorus" },
      { id: "h", section_type: "bridge", label: null, position: 2, lyrics: "Hidden", is_hidden: true },
    ], true);
    expect(sequence.map((section) => section.id)).toEqual(["c", "v", "c"]);
  });

  it("preserves distinct legacy chorus sections but removes copied chorus duplicates", () => {
    const sequence = sequenceSongSections([
      { id: "v", section_type: "verse", label: null, position: 0, lyrics: "Verse" },
      { id: "c", section_type: "chorus", label: null, position: 1, lyrics: "Refrain" },
      { id: "c-copy", section_type: "chorus", label: null, position: 2, lyrics: "Refrain" },
      { id: "c-alt", section_type: "chorus", label: "Alternate", position: 3, lyrics: "Different refrain" },
    ]);
    expect(sequence.map((section) => section.id)).toEqual(["v", "c", "c-alt"]);
  });

  it("keeps unusually long words intact and scales down the slide", () => {
    const longWord = "அ".repeat(100);
    const [slide] = generateSlides([songItem("Long line", 0, [
      { id: "s", section_type: "verse", label: null, position: 0, lyrics: longWord },
    ])]);
    expect(slide.lines).toEqual([longWord]);
    expect(slide.fontScale).toBeLessThan(1);
    expect(slide.fontScale).toBeGreaterThanOrEqual(0.58);
  });

  it("uses public content for non-song items without exposing internal fields", () => {
    const [slide] = generateSlides([{
      id: "item",
      item_type: "scripture_reading",
      title: "Scripture reading",
      position: 0,
      public_content: "Psalm 23\nThe Lord is my shepherd",
    }]);
    expect(slide.lines).toEqual(["Psalm 23", "The Lord is my shepherd"]);
  });
});

describe("clampSlideIndex", () => {
  it("keeps navigation within valid boundaries", () => {
    expect(clampSlideIndex(-1, 3)).toBe(0);
    expect(clampSlideIndex(8, 3)).toBe(2);
    expect(clampSlideIndex(2, 0)).toBe(0);
  });
});
