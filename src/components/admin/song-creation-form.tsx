import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { saveSong } from "@/lib/actions/content";
import { getSectionDisplayLabel } from "@/lib/domain/slides";
import { songEditorLanguages, songLanguages, type SongSectionType } from "@/lib/domain/songs";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/spa/auth-provider";
import { ConfirmationDialog } from "@/components/confirm-button";
import { Dropdown } from "@/components/dropdown";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { useFormAction } from "@/components/use-form-action";
import { invalidateSongCache } from "@/lib/song-cache";

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

type SongTitleMatch = { id: string; title: string };
type SongTitleSearch = { matches: SongTitleMatch[]; exactMatch: SongTitleMatch | null };
type SongTitleMenuPosition = { left: number; top: number; width: number; maxHeight: number };

const pendingTitleSearches = new Map<string, Promise<SongTitleSearch>>();

function searchSongTitles(churchId: string, title: string) {
  const normalizedTitle = title.trim();
  const key = `${churchId}:${normalizedTitle.toLocaleLowerCase()}`;
  const pending = pendingTitleSearches.get(key);
  if (pending) return pending;

  const pattern = normalizedTitle.replace(/[\\%_]/g, "\\$&");
  const request = (async (): Promise<SongTitleSearch> => {
    const supabase = createClient();
    const [matchesResult, exactResult] = await Promise.all([
      supabase.from("songs").select("id, title").eq("church_id", churchId)
        .ilike("title", `%${pattern}%`).order("title").limit(8),
      supabase.from("songs").select("id, title").eq("church_id", churchId)
        .ilike("title", pattern).limit(1),
    ]);
    if (matchesResult.error) throw new Error(`Unable to search song titles: ${matchesResult.error.message}`);
    if (exactResult.error) throw new Error(`Unable to check for an exact song title: ${exactResult.error.message}`);

    const exactMatch = exactResult.data?.[0] ?? matchesResult.data?.find((song) =>
      song.title.trim().toLocaleLowerCase() === normalizedTitle.toLocaleLowerCase(),
    ) ?? null;
    const matches = [...(matchesResult.data ?? [])];
    if (exactMatch && !matches.some((song) => song.id === exactMatch.id)) matches.unshift(exactMatch);
    return { matches, exactMatch };
  })().finally(() => {
    if (pendingTitleSearches.get(key) === request) pendingTitleSearches.delete(key);
  });
  pendingTitleSearches.set(key, request);
  return request;
}

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
  const navigate = useNavigate();
  const { membership } = useAuth();
  const { error, formAction } = useFormAction(saveSong, () => invalidateSongCache(song?.id));
  const [title, setTitle] = useState(song?.title ?? "");
  const [titleMatches, setTitleMatches] = useState<SongTitleMatch[]>([]);
  const [exactTitleMatch, setExactTitleMatch] = useState<SongTitleMatch | null>(null);
  const [titleSearchLoading, setTitleSearchLoading] = useState(false);
  const [titleSearchError, setTitleSearchError] = useState("");
  const [titleSuggestionsOpen, setTitleSuggestionsOpen] = useState(false);
  const [activeTitleSuggestion, setActiveTitleSuggestion] = useState(-1);
  const [titleMenuPosition, setTitleMenuPosition] = useState<SongTitleMenuPosition | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleFieldRef = useRef<HTMLDivElement>(null);
  const titleMenuRef = useRef<HTMLDivElement>(null);
  const titleBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleSearchRequestId = useRef(0);
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
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [deleteVerseKey, setDeleteVerseKey] = useState<string | null>(null);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const query = title.trim();
    if (song || !membership?.churchId || !query) {
      setTitleMatches([]);
      setExactTitleMatch(null);
      setTitleSearchLoading(false);
      setTitleSearchError("");
      return;
    }

    const requestId = ++titleSearchRequestId.current;
    setTitleSearchLoading(true);
    setTitleSearchError("");
    const timer = setTimeout(() => {
      void searchSongTitles(membership.churchId, query).then((result) => {
        if (titleSearchRequestId.current !== requestId) return;
        setTitleMatches(result.matches);
        setExactTitleMatch(result.exactMatch);
        setActiveTitleSuggestion(-1);
        setTitleSearchLoading(false);
      }).catch((searchError: unknown) => {
        if (titleSearchRequestId.current !== requestId) return;
        setTitleMatches([]);
        setExactTitleMatch(null);
        setTitleSearchLoading(false);
        setTitleSearchError(searchError instanceof Error ? searchError.message : "Unable to search song titles.");
      });
    }, 220);
    return () => {
      clearTimeout(timer);
      titleSearchRequestId.current += 1;
    };
  }, [membership?.churchId, song, title]);

  useLayoutEffect(() => {
    if (!titleSuggestionsOpen || !titleInputRef.current) {
      setTitleMenuPosition(null);
      return;
    }
    const updatePosition = () => {
      const rect = titleInputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const edge = 8;
      const gap = 5;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(rect.width, viewportWidth - edge * 2);
      const left = Math.min(Math.max(edge, rect.left), viewportWidth - width - edge);
      const below = viewportHeight - rect.bottom - edge - gap;
      const above = rect.top - edge - gap;
      const openAbove = below < Math.min(220, above) && above > below;
      const maxHeight = Math.max(80, Math.min(320, openAbove ? above : below));
      setTitleMenuPosition({
        left,
        top: openAbove ? Math.max(edge, rect.top - gap - maxHeight) : rect.bottom + gap,
        width,
        maxHeight,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [titleSuggestionsOpen]);

  useEffect(() => {
    if (!titleSuggestionsOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!titleFieldRef.current?.contains(target) && !titleMenuRef.current?.contains(target)) {
        setTitleSuggestionsOpen(false);
        setActiveTitleSuggestion(-1);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [titleSuggestionsOpen]);

  useEffect(() => () => {
    if (titleBlurTimer.current) clearTimeout(titleBlurTimer.current);
  }, []);

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
  const versePendingDelete = numberedVerses.find(({ section }) => section.key === deleteVerseKey);
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
    if (modalDirty) {
      setConfirmDiscard(true);
      return;
    }
    setEditingKey(null);
    setWorkingSection(null);
  }

  function discardVerse() {
    setConfirmDiscard(false);
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

  function deleteVerse() {
    if (!deleteVerseKey) return;
    setSections((current) => current.filter((section) => section.key !== deleteVerseKey));
    setDeleteVerseKey(null);
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
    <form
      className="form-stack admin-form song-editor"
      action={formAction}
      data-dirty-form
      onSubmit={(event) => {
        if (!song && title.trim() && (titleSearchLoading || titleSearchError || exactTitleMatch)) {
          event.preventDefault();
          setTitleSuggestionsOpen(true);
          titleInputRef.current?.focus();
        }
      }}
    >
      {song && <>
        <input type="hidden" name="song_id" value={song.id} />
        <input type="hidden" name="expected_updated_at" value={song.updated_at} />
      </>}
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="language" value={language} />
      <input type="hidden" name="sections" value={sectionPayload} />
      <div className="song-editor-fields">
        <label htmlFor="title">Title</label>
        <div className="song-title-autocomplete" ref={titleFieldRef}>
          <input
            id="title"
            name="title"
            required
            ref={titleInputRef}
            value={title}
            maxLength={200}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded={titleSuggestionsOpen && Boolean(title.trim())}
            aria-controls={titleSuggestionsOpen ? "admin-song-title-suggestions" : undefined}
            aria-activedescendant={activeTitleSuggestion >= 0 ? `admin-song-title-option-${titleMatches[activeTitleSuggestion]?.id}` : undefined}
            onFocus={() => {
              if (titleBlurTimer.current) clearTimeout(titleBlurTimer.current);
              if (title.trim() && !song) setTitleSuggestionsOpen(true);
            }}
            onBlur={() => {
              titleBlurTimer.current = setTimeout(() => setTitleSuggestionsOpen(false), 120);
            }}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setTitle(value);
              setTitleMatches([]);
              setExactTitleMatch(null);
              setTitleSearchLoading(Boolean(value.trim()) && !song);
              setTitleSearchError("");
              setActiveTitleSuggestion(-1);
              setTitleSuggestionsOpen(Boolean(value.trim()) && !song);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setTitleSuggestionsOpen(Boolean(title.trim()) && !song);
                if (titleMatches.length) {
                  const direction = event.key === "ArrowDown" ? 1 : -1;
                  setActiveTitleSuggestion((current) => current < 0
                    ? direction > 0 ? 0 : titleMatches.length - 1
                    : (current + direction + titleMatches.length) % titleMatches.length);
                }
              } else if (event.key === "Enter" && titleSuggestionsOpen && activeTitleSuggestion >= 0) {
                event.preventDefault();
                const selected = titleMatches[activeTitleSuggestion];
                if (selected) navigate(`/admin/songs/${selected.id}`);
              } else if (event.key === "Escape" && titleSuggestionsOpen) {
                event.preventDefault();
                setTitleSuggestionsOpen(false);
                setActiveTitleSuggestion(-1);
              }
            }}
          />
          {exactTitleMatch && title.trim().toLocaleLowerCase() === exactTitleMatch.title.trim().toLocaleLowerCase()
            ? <p className="song-title-duplicate-warning" role="alert">
              A song with this exact title already exists. Select “{exactTitleMatch.title}” to open it, or change the title to create a different song.
            </p>
            : null}
          {titleSearchError && <p className="form-error" role="alert">{titleSearchError}</p>}
          {titleSuggestionsOpen && title.trim() && titleMenuPosition && createPortal(
            <div
              className="song-title-suggestions"
              id="admin-song-title-suggestions"
              role="listbox"
              aria-label="Matching existing songs"
              ref={titleMenuRef}
              style={{
                left: titleMenuPosition.left,
                top: titleMenuPosition.top,
                width: titleMenuPosition.width,
                maxHeight: titleMenuPosition.maxHeight,
              }}
            >
              {titleSearchLoading
                ? <p className="song-title-suggestion-status" role="status">Searching songs…</p>
                : titleSearchError
                  ? <p className="song-title-suggestion-status" role="status">Search unavailable. Try again before creating this song.</p>
                  : titleMatches.length
                    ? titleMatches.map((match, index) => <button
                      type="button"
                      role="option"
                      aria-selected={index === activeTitleSuggestion}
                      id={`admin-song-title-option-${match.id}`}
                      className="song-title-suggestion"
                      data-active={index === activeTitleSuggestion || undefined}
                      key={match.id}
                      onPointerMove={() => setActiveTitleSuggestion(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => navigate(`/admin/songs/${match.id}`)}
                    >
                      {match.title}
                    </button>)
                    : <p className="song-title-suggestion-status" role="status">No matching songs found. You can create a different title.</p>}
            </div>,
            document.body,
          )}
        </div>
        <label htmlFor="author">Author (optional)</label>
        <input id="author" name="author" defaultValue={song?.author ?? ""} maxLength={200} />
        <label htmlFor="source">Source (optional)</label>
        <input id="source" name="source" defaultValue={song?.source ?? ""} maxLength={300} />
        <label htmlFor="language">Language</label>
        <Dropdown
          id="language"
          value={songEditorLanguages.some((option) => option.value === language) ? language : "English"}
          options={songEditorLanguages.map((option) => ({ label: option.label, value: option.value }))}
          onValueChange={setLanguage}
          required
        />
        {song && !songEditorLanguages.some((option) => option.value === song.language) && <p className="muted legacy-language-note">Existing language “{song.language}” will be retained unless you choose another.</p>}
      </div>

      <fieldset className="song-options">
        <legend>Options</legend>
        <label className="check-row"><input type="checkbox" name="has_translation" checked={hasTranslation} onChange={(event) => setHasTranslation(event.target.checked)} /> Has Translation</label>
        <label className="check-row"><input type="checkbox" name="start_with_chorus" checked={startWithChorus} onChange={(event) => setStartWithChorus(event.target.checked)} /> Start With Chorus</label>
      </fieldset>

      <label className="song-ending-control" htmlFor="song-ending">
        <span>Ending</span>
        <Dropdown
          id="song-ending"
          value={ending}
          options={[
            { value: "bridge", label: "End with Bridge" },
            { value: "chorus", label: "End with Chorus after Bridge" },
            ...(sections.some(({ section_type }) => section_type === "pre_chorus")
              ? [{ value: "pre_chorus_chorus", label: "End with Pre-Chorus and Chorus after Bridge" }]
              : []),
          ]}
          onValueChange={(value) => setEnding(value as SongEnding)}
        />
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
              <button type="button" className="icon-button danger" aria-label={`Delete verse ${index + 1}`} title="Delete verse" onClick={() => setDeleteVerseKey(section.key)}><Trash2 size={16} /></button>
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
              <Dropdown
                id={`${type}-translation-language`}
                value={section.translation_language}
                options={[
                  { value: "", label: "Select a language" },
                  ...songLanguages.map((language) => ({ label: language.label, value: language.value })),
                ]}
                onValueChange={(value) => updateSection(section.key, { translation_language: value })}
              />
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

      {error && <p className="form-error" role="alert">{error}</p>}
          <PendingSubmitButton
            className="button button-primary song-save-button"
            pendingLabel="Saving song…"
            disabled={!song && Boolean(title.trim()) && (titleSearchLoading || Boolean(titleSearchError) || Boolean(exactTitleMatch))}
          >
            {song ? "Save song" : "Create song"}
          </PendingSubmitButton>

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
              <Dropdown
                id="verse-translation-language"
                value={workingSection.translation_language}
                options={[
                  { value: "", label: "Select a language" },
                  ...songLanguages.map((language) => ({ label: language.label, value: language.value })),
                ]}
                onValueChange={(value) => setWorkingSection({ ...workingSection, translation_language: value })}
              />
            </>}
          </div>
          <footer className="verse-dialog-actions">
            <button type="button" className="button button-secondary" onClick={() => { setEditingKey(null); setWorkingSection(null); }}>Cancel</button>
            <button type="button" className="button button-primary" onClick={applyVerse}>Apply</button>
          </footer>
        </section>
      </div>}
      {confirmDiscard && <ConfirmationDialog
        title="Discard verse changes?"
        description="Your changes to this verse have not been applied to the song."
        confirmLabel="Discard changes"
        pendingLabel="Discarding…"
        onConfirm={discardVerse}
        onCancel={() => setConfirmDiscard(false)}
      />}
      {versePendingDelete && <ConfirmationDialog
        title="Delete verse?"
        description={`Delete "${sectionTitle(versePendingDelete.section, versePendingDelete.number)}" from this song? This change will be saved when you save the song.`}
        onConfirm={deleteVerse}
        onCancel={() => setDeleteVerseKey(null)}
      />}
    </form>
  );
}
