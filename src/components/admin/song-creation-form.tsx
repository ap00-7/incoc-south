"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { saveSong } from "@/app/admin/actions";
import { getSectionDisplayLabel } from "@/lib/domain/slides";
import { songEditorLanguages, songLanguages, type SongSectionType } from "@/lib/domain/songs";

type SectionInput = {
  id?: string;
  section_type: SongSectionType;
  label: string;
  lyrics: string;
  translation: string;
  translation_language: string;
  is_hidden: boolean;
};
type SectionDraft = SectionInput & { key: string };
type SongEnding = "bridge" | "chorus" | "pre_chorus_chorus";

type SongEditorFormProps = {
  returnTo?: string;
  song?: {
    id: string;
    updated_at: string;
    title: string;
    language: string;
    author: string | null;
    source: string | null;
    has_translation: boolean;
    start_with_chorus: boolean;
    sections: Array<SectionInput & { id: string }>;
  };
};

function SaveSongButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="button button-primary song-save-button" disabled={pending}>
      {pending ? "Saving…" : editing ? "Save song" : "Create song"}
    </button>
  );
}

function blankSection(key: string, type: SongSectionType): SectionDraft {
  return { key, section_type: type, label: "", lyrics: "", translation: "", translation_language: "", is_hidden: false };
}

function sectionTitle(section: SectionDraft, verseNumber: number) {
  return getSectionDisplayLabel(section, verseNumber);
}

function initialEnding(sections: SectionDraft[]): SongEnding {
  const bridgeIndex = sections.findIndex(({ section_type }) => section_type === "bridge");
  const chorusIndex = sections.findIndex(({ section_type }) => section_type === "chorus");
  const preChorusIndex = sections.findIndex(({ section_type }) => section_type === "pre_chorus");
  if (bridgeIndex < 0 || chorusIndex < 0 || bridgeIndex > chorusIndex) return "bridge";
  return preChorusIndex >= 0 && bridgeIndex < preChorusIndex
    ? "pre_chorus_chorus"
    : "chorus";
}

function orderSectionsForEnding(sections: SectionDraft[], ending: SongEnding) {
  const bridgeIndex = sections.findIndex(({ section_type }) => section_type === "bridge");
  if (bridgeIndex < 0) return sections;
  const [bridge] = sections.splice(bridgeIndex, 1);
  if (ending === "bridge") return [...sections, bridge];
  const targetType = ending === "pre_chorus_chorus" ? "pre_chorus" : "chorus";
  const targetIndex = sections.findIndex(({ section_type }) => section_type === targetType);
  sections.splice(targetIndex < 0 ? sections.length : targetIndex, 0, bridge);
  return sections;
}

export function SongEditorForm({ song, returnTo = song ? `/admin/songs/${song.id}` : "/admin/songs" }: SongEditorFormProps) {
  const [sections, setSections] = useState<SectionDraft[]>(() => {
    let keyIndex = 0;
    const initial: SectionDraft[] = song?.sections.map((section) => ({ ...section, key: `section-${keyIndex++}` })) ?? [];
    if (!initial.some(({ section_type }) => section_type === "verse")) initial.unshift(blankSection(`section-${keyIndex++}`, "verse"));
    for (const type of ["pre_chorus", "chorus", "bridge"] as const) {
      if (!initial.some((section) => section.section_type === type)) initial.push(blankSection(`section-${keyIndex++}`, type));
    }
    return initial;
  });
  const [ending, setEnding] = useState<SongEnding>(() => song
    ? initialEnding(song.sections.map((section, index) => ({ ...section, key: `initial-${index}` })))
    : "pre_chorus_chorus");
  const [nextKey, setNextKey] = useState((song?.sections.length ?? 0) + 4);
  const [hasTranslation, setHasTranslation] = useState(song?.has_translation ?? false);
  const [startWithChorus, setStartWithChorus] = useState(song?.start_with_chorus ?? false);
  const [language, setLanguage] = useState(song?.language ?? "English");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [workingSection, setWorkingSection] = useState<SectionDraft | null>(null);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (editingKey) lyricsRef.current?.focus();
    else {
      restoreFocus.current?.focus();
      restoreFocus.current = null;
    }
  }, [editingKey]);

  const sectionPayload = JSON.stringify(orderSectionsForEnding([...sections], ending).filter((section) =>
    section.id || section.section_type === "verse" || section.lyrics.trim() || section.translation.trim(),
  ).map((section) => ({
    ...(section.id ? { id: section.id } : {}),
    section_type: section.section_type,
    section_label: section.label,
    lyrics: section.lyrics,
    translation: section.translation,
    translation_language: section.translation_language,
    is_hidden: section.is_hidden,
  })));
  const verses = sections.filter((section) => section.section_type === "verse");
  let visibleVerseNumber = 0;
  const numberedVerses = verses.map((section, index) => ({
    section,
    index,
    number: section.is_hidden ? visibleVerseNumber + 1 : ++visibleVerseNumber,
  }));
  const primarySpecialKeys = new Set((["pre_chorus", "chorus", "bridge"] as const)
    .map((type) => sections.find((section) => section.section_type === type)?.key));
  const additionalSections = sections.filter((section) => section.section_type !== "verse" && !primarySpecialKeys.has(section.key));
  const editingSection = sections.find((section) => section.key === editingKey);
  const modalDirty = Boolean(workingSection && editingSection && JSON.stringify(workingSection) !== JSON.stringify(editingSection));

  function openVerse(section: SectionDraft, trigger: HTMLElement) {
    restoreFocus.current = trigger;
    setEditingKey(section.key);
    setWorkingSection({ ...section });
  }

  function closeVerse() {
    if (modalDirty && !window.confirm("Discard unapplied verse changes?")) return;
    setEditingKey(null);
    setWorkingSection(null);
  }

  function applyVerse() {
    if (!workingSection) return;
    setSections((current) => current.map((section) => section.key === workingSection.key ? workingSection : section));
    setEditingKey(null);
    setWorkingSection(null);
  }

  function updateSection(key: string, update: Partial<SectionDraft>) {
    setSections((current) => current.map((section) => section.key === key ? { ...section, ...update } : section));
  }

  function moveVerse(key: string, direction: -1 | 1) {
    setSections((current) => {
      const versesOnly = current.filter((section) => section.section_type === "verse");
      const index = versesOnly.findIndex((section) => section.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= versesOnly.length) return current;
      [versesOnly[index], versesOnly[target]] = [versesOnly[target], versesOnly[index]];
      let verseIndex = 0;
      return current.map((section) => section.section_type === "verse" ? versesOnly[verseIndex++] : section);
    });
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeVerse();
    }
    if (event.key !== "Tab") return;
    const targets = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])');
    const first = targets[0];
    const last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <form className="form-stack admin-form song-editor" action={saveSong} data-dirty-form>
      {song && <>
        <input type="hidden" name="song_id" value={song.id} />
        <input type="hidden" name="expected_updated_at" value={song.updated_at} />
      </>}
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="language" value={language} />
      <input type="hidden" name="sections" value={sectionPayload} />
      <div className="song-editor-fields">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required defaultValue={song?.title} maxLength={200} />
        <label htmlFor="author">Author (optional)</label>
        <input id="author" name="author" defaultValue={song?.author ?? ""} maxLength={200} />
        <label htmlFor="source">Source (optional)</label>
        <input id="source" name="source" defaultValue={song?.source ?? ""} maxLength={300} />
        <label htmlFor="language">Language</label>
        <select id="language" value={songEditorLanguages.some((option) => option.value === language) ? language : "English"} onChange={(event) => setLanguage(event.target.value)} required>
          {songEditorLanguages.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
        </select>
        {song && !songEditorLanguages.some((option) => option.value === song.language) && <p className="muted legacy-language-note">Existing language “{song.language}” will be retained unless you choose another.</p>}
      </div>

      <fieldset className="song-options">
        <legend>Options</legend>
        <label className="check-row"><input type="checkbox" name="has_translation" checked={hasTranslation} onChange={(event) => setHasTranslation(event.target.checked)} /> Has Translation</label>
        <label className="check-row"><input type="checkbox" name="start_with_chorus" checked={startWithChorus} onChange={(event) => setStartWithChorus(event.target.checked)} /> Start With Chorus</label>
      </fieldset>

      <label className="song-ending-control" htmlFor="song-ending">
        <span>Ending</span>
        <select id="song-ending" value={ending} onChange={(event) => setEnding(event.target.value as SongEnding)}>
          <option value="bridge">End with Bridge</option>
          <option value="chorus">End with Chorus after Bridge</option>
          {sections.some(({ section_type }) => section_type === "pre_chorus") && <option value="pre_chorus_chorus">End with Pre-Chorus and Chorus after Bridge</option>}
        </select>
      </label>

      <section className="song-editor-section" aria-labelledby="verses-heading">
        <div className="song-editor-section-heading">
          <div><p className="eyebrow">LYRICS</p><h2 id="verses-heading">Verses</h2></div>
          <button className="button button-secondary" type="button" onClick={(event) => {
            const verse = blankSection(`section-${nextKey}`, "verse");
            setNextKey((current) => current + 1);
            setSections((current) => [...current, verse]);
            openVerse(verse, event.currentTarget);
          }}><Plus size={16} /> Add item</button>
        </div>
        <ol className="verse-list">
          {numberedVerses.map(({ section, index, number }) => <li className="verse-row" key={section.key}>
            <button className="verse-open" type="button" onClick={(event) => openVerse(section, event.currentTarget)}>
              <span className="verse-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="verse-row-copy"><strong>{sectionTitle(section, number)}</strong><span>{section.is_hidden ? "Hidden" : section.lyrics.trim() || "No lyrics added"}</span></span>
            </button>
            <div className="verse-actions">
              <button type="button" className="icon-button" aria-label={`Move verse ${index + 1} up`} title="Move up" disabled={index === 0} onClick={() => moveVerse(section.key, -1)}><ArrowUp size={16} /></button>
              <button type="button" className="icon-button" aria-label={`Move verse ${index + 1} down`} title="Move down" disabled={index === verses.length - 1} onClick={() => moveVerse(section.key, 1)}><ArrowDown size={16} /></button>
            </div>
          </li>)}
        </ol>
      </section>

      {(["pre_chorus", "chorus", "bridge"] as const).map((type) => {
        const section = sections.find((item) => item.section_type === type)!;
        const title = type === "pre_chorus" ? "Pre-Chorus" : `${type[0].toUpperCase()}${type.slice(1)}`;
        return <details className="song-part" key={type}>
          <summary><span>{title}</span><span className="muted">{section.is_hidden ? "Hidden" : "Lyrics"}</span></summary>
          <div className="form-stack song-part-fields">
            <label className="check-row"><input type="checkbox" checked={section.is_hidden} onChange={(event) => updateSection(section.key, { is_hidden: event.target.checked })} /> Hide {title}</label>
            <label htmlFor={`${type}-lyrics`}>Lyrics</label>
            <textarea id={`${type}-lyrics`} value={section.lyrics} maxLength={20000} rows={6} onChange={(event) => updateSection(section.key, { lyrics: event.target.value })} />
            {hasTranslation && <>
              <label htmlFor={`${type}-translation`}>Translation</label>
              <textarea id={`${type}-translation`} value={section.translation} maxLength={20000} rows={6} onChange={(event) => updateSection(section.key, { translation: event.target.value })} />
              <label htmlFor={`${type}-translation-language`}>Translation language</label>
              <select id={`${type}-translation-language`} value={section.translation_language} onChange={(event) => updateSection(section.key, { translation_language: event.target.value })}>
                <option value="">Select a language</option>
                {songLanguages.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
              </select>
            </>}
          </div>
        </details>;
      })}

      {additionalSections.length > 0 && <details className="song-part">
        <summary><span>Other saved sections</span><span className="muted">Existing content</span></summary>
        <div className="song-part-fields">
          {additionalSections.map((section) => <div className="form-stack legacy-section" key={section.key}>
            <h3>{getSectionDisplayLabel(section)}</h3>
            <label className="check-row"><input type="checkbox" checked={section.is_hidden} onChange={(event) => updateSection(section.key, { is_hidden: event.target.checked })} /> Hide section</label>
            <label htmlFor={`${section.key}-lyrics`}>Lyrics</label><textarea id={`${section.key}-lyrics`} value={section.lyrics} onChange={(event) => updateSection(section.key, { lyrics: event.target.value })} rows={5} />
            {hasTranslation && <><label htmlFor={`${section.key}-translation`}>Translation</label><textarea id={`${section.key}-translation`} value={section.translation} onChange={(event) => updateSection(section.key, { translation: event.target.value })} rows={5} /></>}
          </div>)}
        </div>
      </details>}

          <SaveSongButton editing={Boolean(song)} />

      {workingSection && <div className="verse-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeVerse(); }}>
        <section className="verse-dialog" role="dialog" aria-modal="true" aria-labelledby="verse-dialog-title" onKeyDown={handleDialogKeyDown}>
          <header className="verse-dialog-header"><div><p className="eyebrow">VERSE</p><h2 id="verse-dialog-title">Edit Verse</h2></div><button type="button" className="icon-button verse-close" aria-label="Close Edit Verse" onClick={closeVerse}><X size={18} /></button></header>
          <div className="form-stack verse-dialog-fields">
            <label htmlFor="verse-hide" className="check-row"><input id="verse-hide" type="checkbox" checked={workingSection.is_hidden} onChange={(event) => setWorkingSection({ ...workingSection, is_hidden: event.target.checked })} /> Hide</label>
            <label htmlFor="verse-lyrics">Lyrics</label>
            <textarea ref={lyricsRef} id="verse-lyrics" value={workingSection.lyrics} maxLength={20000} rows={8} onChange={(event) => setWorkingSection({ ...workingSection, lyrics: event.target.value })} />
            {hasTranslation && <>
              <label htmlFor="verse-translation">Translation</label>
              <textarea id="verse-translation" value={workingSection.translation} maxLength={20000} rows={7} onChange={(event) => setWorkingSection({ ...workingSection, translation: event.target.value })} />
              <label htmlFor="verse-translation-language">Translation language</label>
              <select id="verse-translation-language" value={workingSection.translation_language} onChange={(event) => setWorkingSection({ ...workingSection, translation_language: event.target.value })}>
                <option value="">Select a language</option>
                {songLanguages.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
              </select>
            </>}
          </div>
          <footer className="verse-dialog-actions">
            <button type="button" className="button button-secondary" onClick={() => { setEditingKey(null); setWorkingSection(null); }}>Cancel</button>
            <button type="button" className="button button-primary" onClick={applyVerse}>Apply</button>
          </footer>
        </section>
      </div>}
    </form>
  );
}
