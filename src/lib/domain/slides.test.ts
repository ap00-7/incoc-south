import { describe, expect, it } from "vitest";
import { clampSlideIndex, filterPresentationItems, generateSlides, getAdjacentItemSlideIndex, getSectionDisplayLabel, getTouchSwipeSlideIndex, groupPresentationSlides, labelSongSections, sequenceSongSections, type LyricSection, type ProgrammeItem } from "./slides";

const songItem = (
  title: string,
  position: number,
  sections: LyricSection[],
  startWithChorus = false,
): ProgrammeItem => ({
  id: `item-${position}`,
  item_type: "song",
  title,
  position,
  public_content: null,
  song: { title, start_with_chorus: startWithChorus, song_sections: sections },
});

describe("generateSlides", () => {
  it("keeps horizontal touch swipes within a song and ignores vertical or boundary gestures", () => {
    const slides = [{ itemId: "song" }, { itemId: "song" }, { itemId: "next-item" }];
    expect(getTouchSwipeSlideIndex(slides, 0, 300, 200, 220, 204)).toBe(1);
    expect(getTouchSwipeSlideIndex(slides, 1, 220, 200, 300, 204)).toBe(0);
    expect(getTouchSwipeSlideIndex(slides, 0, 220, 200, 300, 204)).toBeNull();
    expect(getTouchSwipeSlideIndex(slides, 1, 300, 200, 220, 204)).toBeNull();
    expect(getTouchSwipeSlideIndex(slides, 0, 300, 200, 304, 120)).toBeNull();
    expect(getTouchSwipeSlideIndex(slides, 0, 300, 200, 260, 202)).toBeNull();
  });

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

  it("shows each section translation on the same slide as its original lyrics", () => {
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
    expect(slides).toHaveLength(1);
    expect(slides[0].sectionLabel).toBe("Chorus");
    expect(slides[0].lines).toEqual(["Original chorus"]);
    expect(slides[0].translationLines).toEqual(["தமிழ் மொழிபெயர்ப்பு"]);
    expect(slides[0].translationLabel).toBe("Tamil");
  });

  it("repeats the stored chorus after verses and pairs each translation with its original", () => {
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
    ]);
    expect(slides.map((slide) => slide.translationLines?.[0] ?? null)).toEqual([
      "Translation one", null, "Translated refrain", null, null, "Translated refrain",
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

  it("places the bridge after all verses in both chorus modes", () => {
    const sections: LyricSection[] = [
      { id: "v1", section_type: "verse", label: null, position: 0, lyrics: "Verse one" },
      { id: "p", section_type: "pre_chorus", label: "Pre Chorus 1", position: 1, lyrics: "Lift" },
      { id: "c", section_type: "chorus", label: "Chorus 2", position: 2, lyrics: "Refrain" },
      { id: "v2", section_type: "verse", label: "Verse 4", position: 3, lyrics: "Verse two" },
      { id: "b", section_type: "bridge", label: "Bridge Ending", position: 4, lyrics: "Bridge" },
    ];
    expect(sequenceSongSections(sections).map((section) => section.id)).toEqual([
      "v1", "p", "c", "v2", "p", "c", "b",
    ]);
    expect(sequenceSongSections(sections, true).map((section) => section.id)).toEqual([
      "c", "v1", "p", "c", "v2", "p", "c", "b",
    ]);
    expect(generateSlides([songItem("Bridge final", 0, sections, true)]).map((slide) => slide.sectionLabel)).toEqual([
      "Chorus", "Verse 1", "Pre-Chorus", "Chorus", "Verse 2", "Pre-Chorus", "Chorus", "Bridge",
    ]);
  });

  it("handles songs without verses without duplicating the chorus", () => {
    const sections: LyricSection[] = [
      { id: "p", section_type: "pre_chorus", label: null, position: 0, lyrics: "Pre-Chorus" },
      { id: "c", section_type: "chorus", label: null, position: 1, lyrics: "Chorus" },
      { id: "b", section_type: "bridge", label: null, position: 2, lyrics: "Bridge" },
    ];
    expect(sequenceSongSections(sections).map(({ id }) => id)).toEqual(["p", "c", "b"]);
    expect(sequenceSongSections(sections, true).map(({ id }) => id)).toEqual(["c", "p", "b"]);
  });

  it("uses saved section ordering to place an intended ending after the bridge", () => {
    const sections: LyricSection[] = [
      { id: "v1", section_type: "verse", label: null, position: 0, lyrics: "Verse one" },
      { id: "b", section_type: "bridge", label: null, position: 1, lyrics: "Bridge" },
      { id: "p", section_type: "pre_chorus", label: null, position: 2, lyrics: "Lift" },
      { id: "c", section_type: "chorus", label: null, position: 3, lyrics: "Refrain" },
      { id: "v2", section_type: "verse", label: null, position: 4, lyrics: "Verse two" },
    ];
    expect(sequenceSongSections(sections).map(({ id }) => id)).toEqual([
      "v1", "p", "c", "v2", "p", "c", "b", "p", "c",
    ]);
    expect(labelSongSections(sequenceSongSections(sections)).map(({ label }) => label)).toEqual([
      "Verse 1", "Pre-Chorus", "Chorus", "Verse 2", "Pre-Chorus", "Chorus",
      "Bridge", "Pre-Chorus", "Chorus",
    ]);
  });

  it("numbers only verses and normalizes numbered legacy special-section labels", () => {
    expect(getSectionDisplayLabel({ section_type: "verse", label: "Verse 9" }, 2)).toBe("Verse 2");
    expect(getSectionDisplayLabel({ section_type: "verse", label: "Opening refrain" }, 2)).toBe("Verse 2");
    expect(getSectionDisplayLabel({ section_type: "verse", label: null }, 3)).toBe("Verse 3");
    expect(getSectionDisplayLabel({ section_type: "pre_chorus", label: "Pre Chorus 1" })).toBe("Pre-Chorus");
    expect(getSectionDisplayLabel({ section_type: "chorus", label: "Chorus 2" })).toBe("Chorus");
    expect(getSectionDisplayLabel({ section_type: "bridge", label: "Bridge 1" })).toBe("Bridge");
  });

  it("numbers visible verses in sequence while leaving hidden content saved", () => {
    const sections: LyricSection[] = [
      { id: "hidden", section_type: "verse", label: "Verse 1", position: 0, lyrics: "Hidden verse", is_hidden: true },
      { id: "visible", section_type: "verse", label: "Verse 3", position: 1, lyrics: "Visible verse" },
    ];
    const labeled = labelSongSections(sequenceSongSections(sections));
    expect(labeled.map(({ label }) => label)).toEqual(["Verse 1"]);
    expect(sections.find(({ id }) => id === "hidden")?.lyrics).toBe("Hidden verse");
  });

  it("preserves distinct legacy chorus sections but removes copied chorus duplicates", () => {
    const sequence = sequenceSongSections([
      { id: "v", section_type: "verse", label: null, position: 0, lyrics: "Verse" },
      { id: "c", section_type: "chorus", label: null, position: 1, lyrics: "Refrain" },
      { id: "c-copy", section_type: "chorus", label: "Chorus 2", position: 2, lyrics: "Refrain" },
      { id: "c-alt", section_type: "chorus", label: "Alternate", position: 3, lyrics: "Different refrain" },
    ]);
    expect(sequence.map((section) => section.id)).toEqual(["v", "c", "c-alt"]);
  });

  it("filters excluded schedule titles independent of punctuation or spacing", () => {
    const titles = [
      "Pre-service meeting",
      "Welcome & Prayer",
      "Welcome and Prayer",
      "Sermon & Communion",
      "Sermon and Communion",
      "Closing Prayer",
      "Welcome",
      "Opening",
      "Worship",
    ];
    const items: ProgrammeItem[] = titles.map((title, position) => ({
      id: `item-${position}`,
      item_type: "other",
      title,
      position,
      public_content: title,
    }));
    items.push({ id: "hidden", item_type: "other", title: "Hidden item", position: 9, public_content: "Hidden", show_in_slides: false });
    expect(filterPresentationItems(items).map(({ title }) => title)).toEqual(["Welcome", "Opening", "Worship"]);
  });

  it("honors explicit slide visibility for legacy-excluded titles and sorts enabled items", () => {
    const items: ProgrammeItem[] = [
      { id: "later", item_type: "other", title: "Announcements", position: 2, public_content: "Later", show_in_slides: true },
      { id: "excluded-enabled", item_type: "other", title: "Welcome and Prayer", position: 1, public_content: "Welcome", show_in_slides: true },
      { id: "disabled", item_type: "other", title: "Opening", position: 0, public_content: "Hidden", show_in_slides: false },
      { id: "legacy-excluded", item_type: "other", title: "Closing Prayer", position: 3, public_content: "Legacy" },
    ];

    expect(filterPresentationItems(items).map(({ id }) => id)).toEqual(["excluded-enabled", "later"]);
  });

  it("keeps an explicitly enabled song with no lyric sections in Slides", () => {
    const [slide] = generateSlides([{
      id: "empty-song",
      item_type: "song",
      title: "Communion Song",
      position: 0,
      public_content: null,
      show_in_slides: true,
      song: { title: "Song without lyrics", song_sections: [] },
    }]);

    expect(slide).toMatchObject({
      itemId: "empty-song",
      itemTitle: "Song without lyrics",
      itemHeader: "Communion Song",
      lines: [],
    });
  });

  it("groups each song into one overview card while preserving song order and first slide index", () => {
    const slides = generateSlides([
      songItem("First song", 0, [
        { id: "v1", section_type: "verse", label: null, position: 0, lyrics: "Verse one" },
        { id: "c", section_type: "chorus", label: null, position: 1, lyrics: "Chorus" },
        { id: "v2", section_type: "verse", label: null, position: 2, lyrics: "Verse two" },
      ]),
      songItem("Second song", 1, [
        { id: "v", section_type: "verse", label: null, position: 0, lyrics: "Second verse" },
      ]),
    ]);
    const groups = groupPresentationSlides(slides);
    expect(groups.map((group) => group.itemTitle)).toEqual(["First song", "Second song"]);
    expect(groups.map((group) => group.slides.length)).toEqual([4, 1]);
    expect(groups.map((group) => group.firstSlideIndex)).toEqual([0, 4]);
    expect(groups[0].itemType).toBe("song");
    expect(groups[0].itemSubtitle).toBeNull();
    expect(groups[0].content).toBeNull();
    expect(groups[0].slides.map((slide) => slide.lines[0])).toEqual([
      "Verse one", "Chorus", "Verse two", "Chorus",
    ]);
  });

  it("groups uploaded media and configured text for overview cards", () => {
    const groups = groupPresentationSlides(generateSlides([
      {
        id: "image",
        item_type: "other",
        title: "Welcome image",
        position: 0,
        public_content: "Welcome text",
        media_url: "https://example.com/welcome.gif",
      },
      {
        id: "text",
        item_type: "announcement",
        title: "Announcements",
        position: 1,
        public_content: "Please join the fellowship after service.",
      },
    ]));

    expect(groups[0]).toMatchObject({
      itemType: "other",
      itemTitle: "Welcome image",
      content: "Welcome text",
      mediaUrl: "https://example.com/welcome.gif",
    });
    expect(groups[1]).toMatchObject({
      itemType: "announcement",
      itemTitle: "Announcements",
      content: "Please join the fellowship after service.",
      mediaUrl: null,
    });
  });

  it("uses a distinct song title as the subtitle under the schedule item title", () => {
    const [group] = groupPresentationSlides(generateSlides([{
      id: "song-item",
      item_type: "song",
      title: "Opening Song",
      position: 0,
      public_content: null,
      song: {
        title: "Amazing Grace",
        song_sections: [{ id: "verse", section_type: "verse", label: null, position: 0, lyrics: "Verse" }],
      },
    }]));

    expect(group.itemTitle).toBe("Opening Song");
    expect(group.itemSubtitle).toBe("Amazing Grace");
  });

  it("moves between items at their first slide, skipping the current item's remaining slides", () => {
    const slides = generateSlides([
      songItem("First song", 0, [
        { id: "v", section_type: "verse", label: null, position: 0, lyrics: "Verse" },
        { id: "c", section_type: "chorus", label: null, position: 1, lyrics: "Chorus" },
      ]),
      songItem("Second song", 1, [
        { id: "v", section_type: "verse", label: null, position: 0, lyrics: "Second verse" },
      ]),
    ]);

    expect(getAdjacentItemSlideIndex(slides, 0, 1)).toBe(2);
    expect(getAdjacentItemSlideIndex(slides, 1, 1)).toBe(2);
    expect(getAdjacentItemSlideIndex(slides, 2, -1)).toBe(0);
    expect(getAdjacentItemSlideIndex(slides, 0, -1)).toBeNull();
    expect(getAdjacentItemSlideIndex(slides, 2, 1)).toBeNull();
  });

  it("repeats one stored pre-chorus and removes copied pre-chorus rows", () => {
    const sequence = sequenceSongSections([
      { id: "v", section_type: "verse", label: null, position: 0, lyrics: "Verse" },
      { id: "p", section_type: "pre_chorus", label: null, position: 1, lyrics: "Lift" },
      { id: "p-copy", section_type: "pre_chorus", label: "Pre-Chorus 2", position: 2, lyrics: "Lift" },
      { id: "v2", section_type: "verse", label: null, position: 3, lyrics: "Verse two" },
    ]);
    expect(sequence.map(({ id }) => id)).toEqual(["v", "p", "v2", "p"]);
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
