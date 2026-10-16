export const songLanguageValues = [
  "English",
  "Hindi",
  "Kannada",
  "Malayalam",
  "Tamil",
  "Telugu",
] as const;

export const songLanguages = [
  { value: songLanguageValues[0], label: "English" },
  { value: songLanguageValues[1], label: "हिन्दी · Hindi" },
  { value: songLanguageValues[2], label: "ಕನ್ನಡ · Kannada" },
  { value: songLanguageValues[3], label: "മലയാളം · Malayalam" },
  { value: songLanguageValues[4], label: "தமிழ் · Tamil" },
  { value: songLanguageValues[5], label: "తెలుగు · Telugu" },
] as const;

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
