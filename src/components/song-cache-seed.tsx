"use client";

import { useCallback, useEffect } from "react";
import { invalidateSongCache, seedSongSummaries } from "@/lib/song-cache";
import { RealtimeRefresh } from "@/components/realtime-refresh";

type SongSummary = {
  id: string;
  title: string;
  language: string;
  author: string | null;
  updated_at: string;
};

export function SongCacheSeed({ songs, churchId }: { songs: SongSummary[]; churchId: string }) {
  const invalidate = useCallback(() => invalidateSongCache(), []);
  useEffect(() => {
    seedSongSummaries(songs);
  }, [songs]);
  return <RealtimeRefresh
    subscriptions={[{ table: "songs", column: "church_id", value: churchId }]}
    onChange={invalidate}
  />;
}
