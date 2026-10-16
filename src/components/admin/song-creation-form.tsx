"use client";

import { useRef, useState } from "react";
import { createSong } from "@/app/admin/actions";
import { songLanguages, songSectionTypes, type SongSectionType } from "@/lib/domain/songs";

type SectionDraft = {
  key: string;
  section_type: SongSectionType;
  label: string;
  lyrics: string;
  translation: string;
  translation_language: string;
  translation_enabled: boolean;
  expanded: boolean;
};

function newSection(key: string, sectionType: SongSectionType = "verse"): SectionDraft {
  return {
    key,
    section_type: sectionType,
    label: "",
    lyrics: "",
    translation: "",
    translation_language: "",
    translation_enabled: false,
    expanded: true,
  };
}

function sectionName(section: SectionDraft, index: number) {
  return section.label.trim() || `${section.section_type.replaceAll("_", " ")} ${index + 1}`;
}

export function SongCreationForm() {
  const nextKey = useRef(1);
  const [sections, setSections] = useState(() => [newSection("section-0")]);
  const [startWithChorus, setStartWithChorus] = useState(false);
  const sectionPayload = JSON.stringify(sections.map((section, index) => ({
    section_type: section.section_type,
    label: section.label,
    lyrics: section.lyrics,
    translation: section.translation_enabled ? section.translation : "",
    translation_language: section.translation_enabled ? section.translation_language : "",
    position: index,
  })));

  function updateSection(key: string, update: Partial<SectionDraft>) {
    setSections((current) => current.map((section) =>
      section.key === key ? { ...section, ...update } : section,
    ));
  }

  function setChorusFirst(enabled: boolean) {
    setStartWithChorus(enabled);
    setSections((current) => current.map((section, index) =>
      index === 0 ? { ...section, section_type: enabled ? "chorus" : "verse" } : section,
    ));
  }

  return (
    <form className="form-stack admin-form song-editor" action={createSong} data-dirty-form>
      <label htmlFor="title">Song title</label>
      <input id="title" name="title" required maxLength={200} />
      <label htmlFor="language">Song language</label>
      <select id="language" name="language" defaultValue="English" required>
        {songLanguages.map((language) => <option value={language.value} key={language.value}>{language.label}</option>)}
      </select>
      <label htmlFor="author">Author <span className="muted">(optional)</span></label>
      <input id="author" name="author" maxLength={200} />
      <label htmlFor="source">Source <span className="muted">(optional)</span></label>
      <input id="source" name="source" maxLength={300} />

      <label className="check-row">
        <input type="checkbox" checked={startWithChorus} onChange={(event) => setChorusFirst(event.target.checked)} />
        Start with chorus
      </label>
      <input type="hidden" name="sections" value={sectionPayload} />

      <div className="song-section-editor">
        {sections.map((section, index) => (
          <details
            className="song-section-editor-card"
            key={section.key}
            open={section.expanded}
            onToggle={(event) => updateSection(section.key, { expanded: event.currentTarget.open })}
          >
            <summary>
              <span>{sectionName(section, index)}</span>
              <span className="muted">Section {index + 1}</span>
            </summary>
            <div className="form-stack song-section-fields">
              <label htmlFor={`section-type-${section.key}`}>Section type</label>
              <select
                id={`section-type-${section.key}`}
                value={section.section_type}
                onChange={(event) => {
                  const type = songSectionTypes.find((option) => option.value === event.target.value)?.value;
                  if (type) updateSection(section.key, { section_type: type });
                }}
              >
                {songSectionTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}
              </select>
              <label htmlFor={`section-label-${section.key}`}>Section label <span className="muted">(optional)</span></label>
              <input
                id={`section-label-${section.key}`}
                value={section.label}
                maxLength={100}
                placeholder="e.g. Verse 1"
                onChange={(event) => updateSection(section.key, { label: event.target.value })}
              />
              <label htmlFor={`section-lyrics-${section.key}`}>Lyrics</label>
              <textarea
                id={`section-lyrics-${section.key}`}
                value={section.lyrics}
                required
                maxLength={20000}
                rows={7}
                placeholder="Keep line breaks as they should appear in the song."
                onChange={(event) => updateSection(section.key, { lyrics: event.target.value })}
              />
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={section.translation_enabled}
                  onChange={(event) => updateSection(section.key, { translation_enabled: event.target.checked })}
                />
                Add a translation for this section
              </label>
              {section.translation_enabled && <>
                <label htmlFor={`translation-language-${section.key}`}>Translation language</label>
                <select
                  id={`translation-language-${section.key}`}
                  value={section.translation_language}
                  required
                  onChange={(event) => updateSection(section.key, { translation_language: event.target.value })}
                >
                  <option value="">Select a language</option>
                  {songLanguages.map((language) => <option value={language.value} key={language.value}>{language.label}</option>)}
                </select>
                <label htmlFor={`translation-${section.key}`}>Translated lyrics</label>
                <textarea
                  id={`translation-${section.key}`}
                  value={section.translation}
                  required
                  maxLength={20000}
                  rows={6}
                  onChange={(event) => updateSection(section.key, { translation: event.target.value })}
                />
              </>}
              <button
                className="button button-quiet"
                type="button"
                disabled={sections.length === 1}
                onClick={() => setSections((current) => current.filter((item) => item.key !== section.key))}
              >
                Remove section
              </button>
            </div>
          </details>
        ))}
      </div>

      <button className="button button-secondary" type="button" onClick={() => setSections((current) => [
        ...current,
        newSection(`section-${nextKey.current++}`),
      ])}>
        Add another section
      </button>
      <button className="button button-primary">Save song</button>
    </form>
  );
}
