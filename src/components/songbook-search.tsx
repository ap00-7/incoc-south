import { Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dropdown } from "@/components/dropdown";

export type SongbookResult = {
  id: string;
  title: string;
  language: string;
  author: string | null;
  updated_at: string;
};

const languageOptions = ["English", "Hindi", "Kannada", "Tamil"] as const;

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
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedFiltersRef = useRef(`${query.trim()}|${language}`);
  const [title, setTitle] = useState(query);
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const navigateToFilters = useCallback((nextTitle: string, nextLanguage: string, replace = true) => {
    const params = new URLSearchParams();
    if (nextTitle.trim()) params.set("q", nextTitle.trim());
    if (nextLanguage) params.set("language", nextLanguage);
    const href = params.size ? `/song?${params.toString()}` : "/song";
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

  const suggestions = useMemo(() => {
    const normalized = title.trim().toLocaleLowerCase();
    if (!normalized) return [];
    return songs.filter((song) =>
      song.title.toLocaleLowerCase().includes(normalized)
      && (!selectedLanguage || song.language === selectedLanguage),
    ).slice(0, 8);
  }, [selectedLanguage, songs, title]);

  function onTitleChange(value: string) {
    setTitle(value);
    setActiveIndex(-1);
    setOpen(Boolean(value.trim()));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
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
      navigate(`/song/${song.id}`);
      setOpen(false);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="songbook-search">
      <label className="sr-only" htmlFor="song-title-search">Search song titles</label>
      <input
        id="song-title-search"
        className="search-input"
        type="search"
        name="q"
        autoComplete="off"
        value={title}
        placeholder="Search by song title"
        aria-autocomplete="list"
        aria-controls="song-title-suggestions"
        aria-expanded={open && suggestions.length > 0}
        aria-activedescendant={activeIndex >= 0 ? `song-suggestion-${suggestions[activeIndex]?.id}` : undefined}
        onFocus={() => setOpen(Boolean(title.trim()))}
        onBlur={() => {
          blurTimerRef.current = setTimeout(() => setOpen(false), 120);
        }}
        onChange={(event) => onTitleChange(event.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
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
          navigateToFilters(title, value);
        }}
      />
      {open && suggestions.length > 0 && <ul className="song-suggestions" id="song-title-suggestions" role="listbox" aria-label="Matching songs">
        {suggestions.map((song, index) => (
          <li key={song.id} role="option" aria-selected={index === activeIndex} id={`song-suggestion-${song.id}`}>
            <Link
              className="song-suggestion-link"
              to={`/song/${song.id}`}
              state={{ songOrigin: "songbook" }}
              onClick={() => {
                if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                setOpen(false);
              }}
            >
              {song.title}
            </Link>
          </li>
        ))}
      </ul>}
    </div>
  );
}
