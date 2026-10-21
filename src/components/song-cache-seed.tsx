"use client";

import { useEffect } from "react";
import { seedSongSummaries } from "@/lib/song-cache";

type SongSummary = {
  id: string;
  title: string;
  language: string;
  author: string | null;
  is_published: boolean;
  updated_at: string;
};

export function SongCacheSeed({ songs }: { songs: SongSummary[] }) {
  useEffect(() => {
    seedSongSummaries(songs);
  }, [songs]);
  return null;
}
