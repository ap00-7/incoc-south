import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Dropdown } from "@/components/dropdown";
import { isMultilingualSong } from "@/lib/domain/songs";

export type SongbookResult = {
  id: string;
  title: string;
  language: string;
  song_sections?: Array<{
    lyrics?: string;
    lyrics_language?: string | null;
    translation?: string | null;
    translation_language?: string | null;
  }>;
  author: string | null;
  updated_at: string;
};

const languageOptions = ["English", "Hindi", "Kannada", "Tamil", "Telugu", "Malayalam", "Multilingual"] as const;

export function SongbookSearch({
  songs,
  query,
  language,
}: {
  songs: SongbookResult[];
  query: string;
  language: string;
}) {
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const appliedFiltersRef = useRef(`${query.trim()}|${language}`);
  const [title, setTitle] = useState(query);
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const navigateToFilters = useCallback((nextTitle: string, nextLanguage: string, replace = true) => {
    const params = new URLSearchParams();
    if (nextTitle.trim()) params.set("q", nextTitle.trim());
    if (nextLanguage) params.set("language", nextLanguage);
    const href = params.size ? `/songs?${params.toString()}` : "/songs";
    appliedFiltersRef.current = `${nextTitle.trim()}|${nextLanguage}`;
    navigate(href, { replace });
  }, [navigate]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (appliedFiltersRef.current === `${title.trim()}|${selectedLanguage}`) return;
    timerRef.current = setTimeout(() => navigateToFilters(title, selectedLanguage), 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [navigateToFilters, selectedLanguage, title]);

  useEffect(() => {
    const nextFilters = `${query.trim()}|${language}`;
    if (appliedFiltersRef.current === nextFilters) return;
    appliedFiltersRef.current = nextFilters;
    setTitle(query);
    setSelectedLanguage(language);
    setActiveIndex(-1);
    setOpen(false);
  }, [language, query]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !searchRef.current?.contains(event.target)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const suggestions = useMemo(() => {
    const normalized = title.trim().toLocaleLowerCase();
    if (!normalized) return [];
    return songs.filter((song) =>
      song.title.toLocaleLowerCase().includes(normalized)
      && (!selectedLanguage
        || (selectedLanguage === "Multilingual"
          ? isMultilingualSong(song.language, song.song_sections ?? [])
          : song.language === selectedLanguage)),
    ).slice(0, 8);
  }, [selectedLanguage, songs, title]);

  function onTitleChange(value: string) {
    setTitle(value);
    setActiveIndex(-1);
    setOpen(Boolean(value.trim()));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === "Enter" && open && suggestions.length) {
      event.preventDefault();
      const song = suggestions[activeIndex >= 0 ? activeIndex : 0];
      navigate(`/songs/${song.id}`, { state: { songOrigin: "songbook" } });
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Tab") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="songbook-search" ref={searchRef}>
      <label className="sr-only" htmlFor="song-title-search">Search song titles</label>
      <div className="songbook-search-field">
        <input
          id="song-title-search"
          className="search-input"
          type="search"
          name="q"
          autoComplete="off"
          value={title}
          placeholder="Search by song title"
          onFocus={() => setOpen(Boolean(title.trim()))}
          onChange={(event) => onTitleChange(event.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <label className="sr-only" htmlFor="song-language-filter">Filter by language</label>
      <Dropdown
        id="song-language-filter"
        value={selectedLanguage}
        aria-label="Filter by language"
        options={[
          { value: "", label: "All languages" },
          ...languageOptions.map((item) => ({ value: item, label: item })),
        ]}
        onValueChange={(value) => {
          setSelectedLanguage(value);
          setActiveIndex(-1);
          setOpen(Boolean(title.trim()));
          navigateToFilters(title, value);
        }}
      />
    </div>
  );
}
