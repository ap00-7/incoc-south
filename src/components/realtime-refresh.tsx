import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { notifyDataChanged, notifyScheduleDeleted } from "@/spa/data-events";

export type RealtimeFilter = {
  table: "songs" | "song_sections" | "schedules" | "schedule_items" | "church_members" | "announcement_items" | "announcement_collections";
  column: string;
  value: string;
};

export function RealtimeRefresh({
  subscriptions,
  onChange,
  onDelete,
  refreshOnSubscribe = false,
  notifyGlobalDataChange = true,
  showUnavailableMessage = true,
}: {
  subscriptions: RealtimeFilter[];
  onChange?: () => void;
  onDelete?: (scheduleId: string) => void;
  refreshOnSubscribe?: boolean;
  notifyGlobalDataChange?: boolean;
  showUnavailableMessage?: boolean;
}) {
  const [unavailable, setUnavailable] = useState(false);
  const onChangeRef = useRef(onChange);
  const onDeleteRef = useRef(onDelete);
  const serialized = useMemo(() => JSON.stringify(subscriptions), [subscriptions]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onDeleteRef.current = onDelete;
  }, [onDelete]);

  useEffect(() => {
    const filters = JSON.parse(serialized) as RealtimeFilter[];
    if (!filters.length) return;
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let failureTimer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    let hasSubscribed = false;
    const clearFailureTimer = () => {
      if (failureTimer) clearTimeout(failureTimer);
      failureTimer = undefined;
    };
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (!alive) return;
        onChangeRef.current?.();
        if (notifyGlobalDataChange) notifyDataChanged();
      }, 80);
    };
    let channel = supabase.channel(`content-updates:${filters.map((filter) => `${filter.table}-${filter.value}`).join(":")}`);
    for (const filter of filters) {
      if (filter.table === "announcement_items" || filter.table === "announcement_collections") {
        for (const event of ["INSERT", "UPDATE"] as const) {
          channel = channel.on("postgres_changes", {
            event,
            schema: "public",
            table: filter.table,
            filter: `${filter.column}=eq.${filter.value}`,
          }, refresh);
        }
        channel = channel.on("postgres_changes", {
          event: "DELETE",
          schema: "public",
          table: filter.table,
        }, refresh);
      } else if (filter.table === "schedules") {
        for (const event of ["INSERT", "UPDATE"] as const) {
          channel = channel.on("postgres_changes", {
            event,
            schema: "public",
            table: filter.table,
            filter: `${filter.column}=eq.${filter.value}`,
          }, refresh);
        }
      } else {
        channel = channel.on("postgres_changes", {
          event: "*",
          schema: "public",
          table: filter.table,
          filter: `${filter.column}=eq.${filter.value}`,
        }, refresh);
      }
    }
    if (filters.some((filter) => filter.table === "schedules")) {
      channel = channel.on("postgres_changes", {
        event: "DELETE",
        schema: "public",
        table: "schedules",
      }, (payload) => {
        const scheduleId = payload.old.id;
        if (typeof scheduleId !== "string") return;
        if (!notifyScheduleDeleted(scheduleId)) return;
        onDeleteRef.current?.(scheduleId);
        refresh();
      });
    }
    channel.subscribe((status) => {
      if (!alive) return;
      if (status === "SUBSCRIBED") {
        clearFailureTimer();
        setUnavailable(false);
        if (hasSubscribed || refreshOnSubscribe) refresh();
        hasSubscribed = true;
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
  }, [notifyGlobalDataChange, refreshOnSubscribe, serialized]);

  if (!unavailable || !showUnavailableMessage) return null;
  return <p className="realtime-notice" role="status">
    Live updates are temporarily unavailable. Existing content remains available.{" "}
    <button type="button" className="text-link" onClick={() => {
      onChangeRef.current?.();
      if (notifyGlobalDataChange) notifyDataChanged();
    }}>Refresh content</button>
  </p>;
}
