"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Maximize, Pause, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { clampSlideIndex, type PresentationSlide } from "@/lib/domain/slides";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { OwnerSessionStatus } from "@/components/owner-session-status";

export function Presentation({
  scheduleId,
  scheduleTitle,
  slides,
  isOwner,
  canReadSession,
  userId,
  songIds,
}: {
  scheduleId: string;
  scheduleTitle: string;
  slides: PresentationSlide[];
  isOwner: boolean;
  canReadSession: boolean;
  userId: string | null;
  songIds: string[];
}) {
  const [index, setIndex] = useState(0);
  const [syncActive, setSyncActive] = useState(false);
  const [syncError, setSyncError] = useState("");
  const currentIndex = clampSlideIndex(index, slides.length);

  useEffect(() => {
    if (!canReadSession) return;
    const supabase = createClient();
    let alive = true;
    const refresh = async () => {
      const { data, error } = await supabase.from("presentation_sessions")
        .select("current_slide_index, is_active").eq("schedule_id", scheduleId).maybeSingle();
      if (!alive) return;
      if (error) {
        setSyncError(`Could not refresh shared presentation state: ${error.message}`);
      } else if (data) {
        setSyncActive(data.is_active);
        if (data.is_active) setIndex(clampSlideIndex(data.current_slide_index, slides.length));
      }
    };
    const channel = supabase.channel(`presentation:${scheduleId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "presentation_sessions",
        filter: `schedule_id=eq.${scheduleId}`,
      }, () => { void refresh(); })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refresh();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setSyncError("Live connection is unavailable. Local slide navigation still works.");
        }
      });
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [canReadSession, scheduleId, slides.length]);

  const goTo = useCallback(async (nextIndex: number) => {
    const safeIndex = clampSlideIndex(nextIndex, slides.length);
    if (syncActive && !isOwner) return;
    setIndex(safeIndex);
    setSyncError("");
    if (!syncActive || !isOwner) return;
    if (!userId) {
      setSyncError("Your owner session is unavailable. Sign in again to control the shared presentation.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("presentation_sessions")
      .update({
        current_item_id: slides[safeIndex]?.itemId ?? null,
        current_slide_index: safeIndex,
        updated_by: userId,
      })
      .eq("schedule_id", scheduleId);
    if (error) setSyncError(`Slide changed locally, but could not update the shared presentation: ${error.message}`);
  }, [isOwner, scheduleId, slides, syncActive, userId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))) return;
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        void goTo(currentIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        void goTo(currentIndex - 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentIndex, goTo]);

  async function toggleSync() {
    if (!isOwner) return;
    if (!userId) {
      setSyncError("Your owner session is unavailable. Sign in again to control the shared presentation.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("presentation_sessions").upsert({
      schedule_id: scheduleId,
      current_item_id: slides[currentIndex]?.itemId ?? null,
      current_slide_index: currentIndex,
      is_active: !syncActive,
      updated_by: userId,
    }, { onConflict: "schedule_id" });
    if (error) {
      setSyncError(`Could not change synchronized mode: ${error.message}`);
      return;
    }
    setSyncActive(!syncActive);
    setSyncError("");
  }

  async function toggleFullscreen() {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }

  const current = slides[currentIndex];
  const itemStarts = slides.reduce<number[]>((starts, slide, slideIndex) => {
    if (slideIndex === 0 || slide.itemId !== slides[slideIndex - 1].itemId) starts.push(slideIndex);
    return starts;
  }, []);
  const currentItemPosition = itemStarts.findIndex((start) => start <= currentIndex && (itemStarts[itemStarts.indexOf(start) + 1] ?? slides.length) > currentIndex);

  function moveItem(step: number) {
    const next = itemStarts[currentItemPosition + step];
    if (next !== undefined) void goTo(next);
  }

  return (
    <main className="presentation-page">
      <RealtimeRefresh subscriptions={[
        { table: "schedules", column: "id", value: scheduleId },
        { table: "schedule_items", column: "schedule_id", value: scheduleId },
        ...songIds.flatMap((songId) => [
          { table: "songs" as const, column: "id", value: songId },
          { table: "song_sections" as const, column: "song_id", value: songId },
        ]),
        ...(userId ? [{ table: "church_members" as const, column: "user_id", value: userId }] : []),
      ]} />
      <div className="presentation-toolbar">
        <div className="presentation-status">
          <Link href={`/schedule/${scheduleId}`}><ArrowLeft size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />Return to service</Link>
          <span style={{ marginLeft: 16 }}>{scheduleTitle}</span>
          <span style={{ marginLeft: 14, color: syncActive ? "#d7b875" : "#aaa" }}>{syncActive ? "Synchronized" : "Local mode"}</span>
          <OwnerSessionStatus configured />
        </div>
        <div className="presentation-controls" aria-label="Presentation controls">
          {isOwner && <button type="button" onClick={() => void toggleSync()} aria-label={syncActive ? "Stop synchronized presentation" : "Start synchronized presentation"}>{syncActive ? <Pause size={15} /> : <Play size={15} />}</button>}
          <button type="button" onClick={() => moveItem(-1)} disabled={currentItemPosition <= 0 || (syncActive && !isOwner)} aria-label="Previous programme item">|‹</button>
          <button type="button" onClick={() => void goTo(currentIndex - 1)} disabled={currentIndex <= 0 || (syncActive && !isOwner)} aria-label="Previous slide"><ChevronLeft size={17} /></button>
          <span aria-live="polite">{slides.length ? `Item ${currentItemPosition + 1} / ${itemStarts.length} · Slide ${currentIndex + 1} / ${slides.length}` : "0 / 0"}</span>
          <button type="button" onClick={() => void goTo(currentIndex + 1)} disabled={currentIndex >= slides.length - 1 || (syncActive && !isOwner)} aria-label="Next slide"><ChevronRight size={17} /></button>
          <button type="button" onClick={() => moveItem(1)} disabled={currentItemPosition >= itemStarts.length - 1 || (syncActive && !isOwner)} aria-label="Next programme item">›|</button>
          <button type="button" onClick={() => void toggleFullscreen()} aria-label="Toggle fullscreen"><Maximize size={15} /></button>
        </div>
      </div>
      {syncError && <p role="status" style={{ margin: 0, padding: "8px 16px", color: "#f1c97a", background: "#171717", fontSize: 12 }}>{syncError}</p>}
      <section className="slide-stage" aria-live="polite">
        {current ? <>
          {current.sectionLabel && <p className="slide-section">{current.sectionLabel}</p>}
          <h1 className="slide-title">{current.itemTitle}</h1>
          {current.lines.length ? <div className="slide-lyrics" style={{ fontSize: `clamp(30px, ${5 * current.fontScale}vw, ${70 * current.fontScale}px)` }}>{current.lines.join("\n")}</div> : <p className="slide-empty">No display content was added for this programme item.</p>}
        </> : <p className="slide-empty">There are no slides in this service yet.</p>}
      </section>
    </main>
  );
}
