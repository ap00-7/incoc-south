import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { notifyDataChanged } from "@/spa/data-events";

export type RealtimeFilter = {
  table: "songs" | "song_sections" | "schedules" | "schedule_items" | "church_members";
  column: string;
  value: string;
};

export function RealtimeRefresh({ subscriptions, onChange }: { subscriptions: RealtimeFilter[]; onChange?: () => void }) {
  const [unavailable, setUnavailable] = useState(false);
  const onChangeRef = useRef(onChange);
  const serialized = useMemo(() => JSON.stringify(subscriptions), [subscriptions]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const filters = JSON.parse(serialized) as RealtimeFilter[];
    if (!filters.length) return;
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let failureTimer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    const clearFailureTimer = () => {
      if (failureTimer) clearTimeout(failureTimer);
      failureTimer = undefined;
    };
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (!alive) return;
        onChangeRef.current?.();
        notifyDataChanged();
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
      if (!alive) return;
      if (status === "SUBSCRIBED") {
        clearFailureTimer();
        setUnavailable(false);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (!failureTimer) {
          failureTimer = setTimeout(() => {
            if (alive) setUnavailable(true);
          }, 8_000);
        }
      }
    });
    return () => {
      alive = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      clearFailureTimer();
      void supabase.removeChannel(channel);
    };
  }, [serialized]);

  if (!unavailable) return null;
  return <p className="realtime-notice" role="status">
    Live updates are temporarily unavailable. Existing content remains available.{" "}
    <button type="button" className="text-link" onClick={() => {
      onChangeRef.current?.();
      notifyDataChanged();
    }}>Refresh content</button>
  </p>;
}
