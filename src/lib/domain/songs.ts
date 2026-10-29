export const lyricLanguageValues = [
  "English",
  "Hindi",
  "Kannada",
  "Malayalam",
  "Tamil",
  "Telugu",
] as const;

export const songLanguageValues = [...lyricLanguageValues, "Multilingual"] as const;

export const songLanguages = [
  { value: lyricLanguageValues[0], label: "English" },
  { value: lyricLanguageValues[1], label: "हिन्दी · Hindi" },
  { value: lyricLanguageValues[2], label: "ಕನ್ನಡ · Kannada" },
  { value: lyricLanguageValues[3], label: "മലയാളം · Malayalam" },
  { value: lyricLanguageValues[4], label: "தமிழ் · Tamil" },
  { value: lyricLanguageValues[5], label: "తెలుగు · Telugu" },
] as const;

export const songEditorLanguages = [
  { value: "English", label: "English" },
  { value: "Kannada", label: "ಕನ್ನಡ · Kannada" },
  { value: "Tamil", label: "தமிழ் · Tamil" },
  { value: "Hindi", label: "हिन्दी · Hindi" },
  { value: "Multilingual", label: "Multilingual" },
] as const;

export const songEditorLanguageValues = songEditorLanguages.map(({ value }) => value) as [
  "English",
  "Kannada",
  "Tamil",
  "Hindi",
  "Multilingual",
];

export const songSectionValues = [
  "verse",
  "chorus",
  "pre_chorus",
  "bridge",
  "intro",
  "outro",
  "other",
] as const;

export const songSectionTypes = [
  { value: songSectionValues[0], label: "Verse" },
  { value: songSectionValues[1], label: "Chorus" },
  { value: songSectionValues[2], label: "Pre-chorus" },
  { value: songSectionValues[3], label: "Bridge" },
  { value: songSectionValues[4], label: "Intro" },
  { value: songSectionValues[5], label: "Outro" },
  { value: songSectionValues[6], label: "Other" },
] as const;

export type SongLanguage = (typeof songLanguageValues)[number];
export type SongSectionType = (typeof songSectionValues)[number];

export function isMultilingualSong(
  language: string,
  sections: Array<{
    lyrics?: string;
    lyrics_language?: string | null;
    translation?: string | null;
    translation_language?: string | null;
  }>,
) {
  if (language === "Multilingual") return true;
  const lyricLanguages = new Set<string>();
  for (const section of sections) {
    if (section.lyrics?.trim()) lyricLanguages.add(section.lyrics_language || language);
    if (section.translation?.trim() && section.translation_language && section.translation_language !== language) return true;
  }
  return lyricLanguages.size > 1;
}
