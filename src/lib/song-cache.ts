"use client";

import { createClient } from "@/lib/supabase/browser";

type SongSummary = {
  id: string;
  title: string;
  language: string;
  author: string | null;
  is_published: boolean;
  updated_at: string;
};

async function fetchSong(songId: string, isOwner: boolean) {
  let query = createClient().from("songs")
    .select("id, title, language, author, source, has_translation, start_with_chorus, is_published, updated_at, song_sections(id, section_type, label, position, lyrics, translation, translation_language, is_hidden), church:churches!inner(slug)")
    .eq("id", songId).eq("church.slug", "incoc-south");
  if (!isOwner) query = query.eq("is_published", true);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Unable to load song: ${error.message}`);
  return data;
}

export type CachedSong = NonNullable<Awaited<ReturnType<typeof fetchSong>>>;

const summaries = new Map<string, SongSummary>();
const songs = new Map<string, CachedSong>();
const pending = new Map<string, Promise<CachedSong | null>>();
let cacheVersion = 0;

export function seedSongSummaries(items: SongSummary[]) {
  for (const item of items) {
    if (!item.is_published) continue;
    summaries.set(item.id, item);
    if (songs.has(item.id) && songs.get(item.id)?.updated_at !== item.updated_at) {
      invalidateSongCache(item.id);
      summaries.set(item.id, item);
    }
  }
}

export function getCachedSong(songId: string, updatedAt: string) {
  const song = songs.get(songId);
  return song?.is_published && song.updated_at === updatedAt ? song : null;
}

export function getCachedSongSummary(songId: string, updatedAt: string) {
  const summary = summaries.get(songId);
  return summary?.updated_at === updatedAt ? summary : null;
}

export async function loadSong(songId: string, isOwner: boolean, updatedAt: string) {
  const cached = getCachedSong(songId, updatedAt);
  if (cached) return cached;

  const key = `${songId}:${isOwner ? "owner" : "public"}:${updatedAt}`;
  const existing = pending.get(key);
  if (existing) return existing;

  const version = cacheVersion;
  const request = fetchSong(songId, isOwner).then((song) => {
    if (song && song.updated_at !== updatedAt) {
      throw new Error("This song changed while it was loading. Please refresh and try again.");
    }
    if (song?.is_published && version === cacheVersion) songs.set(songId, song);
    return song;
  }).finally(() => {
    if (pending.get(key) === request) pending.delete(key);
  });
  pending.set(key, request);
  return request;
}

export function invalidateSongCache(songId?: string) {
  cacheVersion += 1;
  if (songId) {
    songs.delete(songId);
    summaries.delete(songId);
    for (const key of pending.keys()) {
      if (key.startsWith(`${songId}:`)) pending.delete(key);
    }
    return;
  }
  songs.clear();
  summaries.clear();
  pending.clear();
}
