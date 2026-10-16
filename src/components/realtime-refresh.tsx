"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export type RealtimeFilter = {
  table: "songs" | "song_sections" | "schedules" | "schedule_items" | "church_members";
  column: string;
  value: string;
};

export function RealtimeRefresh({ subscriptions }: { subscriptions: RealtimeFilter[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const serialized = useMemo(() => JSON.stringify(subscriptions), [subscriptions]);

  useEffect(() => {
    const filters = JSON.parse(serialized) as RealtimeFilter[];
    if (!filters.length) return;
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (alive) router.refresh();
      }, 80);
    };
    let channel = supabase.channel(`content-updates:${filters.map((filter) => `${filter.table}-${filter.value}`).join(":")}`);
    for (const filter of filters) {
      channel = channel.on("postgres_changes", {
        event: "*",
        schema: "public",
        table: filter.table,
        filter: `${filter.column}=eq.${filter.value}`,
      }, refresh);
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") refresh();
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setError("Live updates are unavailable. Refresh the page to see the latest changes.");
      }
    });
    return () => {
      alive = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [router, serialized]);

  return error ? <p className="realtime-notice" role="status">{error}</p> : null;
}
