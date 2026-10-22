import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Home } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { clampSlideIndex, getTouchSwipeSlideIndex, groupPresentationSlides, type PresentationSlide } from "@/lib/domain/slides";
import { RealtimeRefresh } from "@/components/realtime-refresh";

type PresentationPosition = {
  itemIndex: number;
  slideIndex: number;
};

function getPresentationPosition(groups: ReturnType<typeof groupPresentationSlides>, slideIndex: number): PresentationPosition {
  if (!groups.length) return { itemIndex: 0, slideIndex: 0 };
  const totalSlides = groups.reduce((total, group) => total + group.slides.length, 0);
  const safeIndex = clampSlideIndex(slideIndex, totalSlides);
  const itemIndex = groups.findIndex((group) =>
    safeIndex >= group.firstSlideIndex && safeIndex < group.firstSlideIndex + group.slides.length,
  );
  const selectedItemIndex = itemIndex < 0 ? 0 : itemIndex;
  return {
    itemIndex: selectedItemIndex,
    slideIndex: safeIndex - groups[selectedItemIndex].firstSlideIndex,
  };
}

export function Presentation({
  scheduleId,
  scheduleTitle,
  refreshing,
  initialSlide,
  slides,
  isOwner,
  canReadSession,
  userId,
  songIds,
}: {
  scheduleId: string;
  scheduleTitle: string;
  refreshing: boolean;
  initialSlide: number;
  slides: PresentationSlide[];
  isOwner: boolean;
  canReadSession: boolean;
  userId: string | null;
  songIds: string[];
}) {
  const navigate = useNavigate();
  const groups = useMemo(() => groupPresentationSlides(slides), [slides]);
  const initialPosition = getPresentationPosition(groups, initialSlide);
  const [selectedItemIndex, setSelectedItemIndex] = useState(initialPosition.itemIndex);
  const [slideIndex, setSlideIndex] = useState(initialPosition.slideIndex);
  const [syncActive, setSyncActive] = useState(false);
  const [syncError, setSyncError] = useState("");
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const positionRef = useRef<PresentationPosition>(initialPosition);
  const currentGroupIndex = clampSlideIndex(selectedItemIndex, groups.length);
  const currentGroup = groups[currentGroupIndex];
  const currentSlideIndex = clampSlideIndex(slideIndex, currentGroup?.slides.length ?? 0);
  const current = currentGroup?.slides[currentSlideIndex];
  const isVideo = Boolean(current?.mediaUrl && /\.(mp4|webm)(?:$|\?)/i.test(current.mediaUrl));
  const fullscreenImageUrl = current && !isVideo
    ? current.mediaUrl || current.backgroundImageUrl
    : null;

  useEffect(() => {
    if (!canReadSession) return;
    const supabase = createClient();
    let alive = true;
    let failureTimer: ReturnType<typeof setTimeout> | undefined;
    const clearFailureTimer = () => {
      if (failureTimer) clearTimeout(failureTimer);
      failureTimer = undefined;
    };
    const connectionError = "Live connection is unavailable. Local slide navigation still works.";
    const refresh = async () => {
      const { data, error } = await supabase.from("presentation_sessions")
        .select("current_slide_index, is_active").eq("schedule_id", scheduleId).maybeSingle();
      if (!alive) return;
      if (error) {
        setSyncError(`Could not refresh shared presentation state: ${error.message}`);
      } else if (data) {
        setSyncError((current) => current.startsWith("Could not refresh shared presentation state:") ? "" : current);
        setSyncActive(data.is_active);
        if (data.is_active) {
          const position = getPresentationPosition(groups, data.current_slide_index);
          positionRef.current = position;
          setSelectedItemIndex(position.itemIndex);
          setSlideIndex(position.slideIndex);
        }
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
        if (!alive) return;
        if (status === "SUBSCRIBED") {
          clearFailureTimer();
          setSyncError((current) => current === connectionError ? "" : current);
          void refresh();
        } else if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !failureTimer) {
          failureTimer = setTimeout(() => {
            if (alive) setSyncError((current) => current || connectionError);
          }, 8_000);
        }
      });
    return () => {
      alive = false;
      clearFailureTimer();
      void supabase.removeChannel(channel);
    };
  }, [canReadSession, groups, scheduleId]);

  const moveSlide = useCallback(async (direction: -1 | 1) => {
    if (syncActive && !isOwner) return;
    const currentPosition = positionRef.current;
    const itemIndex = clampSlideIndex(currentPosition.itemIndex, groups.length);
    const group = groups[itemIndex];
    if (!group) return;
    const safeIndex = clampSlideIndex(currentPosition.slideIndex + direction, group.slides.length);
    if (safeIndex === currentPosition.slideIndex) return;
    const nextPosition = { itemIndex, slideIndex: safeIndex };
    positionRef.current = nextPosition;
    setSlideIndex(safeIndex);
    setSyncError("");
    if (!syncActive || !isOwner) return;
    if (!userId) {
      setSyncError("Your owner session is unavailable. Sign in again to control the shared presentation.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("presentation_sessions")
      .update({
        current_item_id: group.itemId,
        current_slide_index: group.firstSlideIndex + safeIndex,
        updated_by: userId,
      })
      .eq("schedule_id", scheduleId);
    if (error) setSyncError(`Slide changed locally, but could not update the shared presentation: ${error.message}`);
  }, [groups, isOwner, scheduleId, syncActive, userId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))) return;
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        void moveSlide(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        void moveSlide(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        navigate(`/slides?scheduleId=${encodeURIComponent(scheduleId)}`);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveSlide, navigate, scheduleId]);

  const hasLyrics = Boolean(current?.lines.length || current?.translationLines?.length);
  const totalLyricLines = (current?.lines.length ?? 0) + (current?.translationLines?.length ?? 0);
  const lyricScale = current
    ? Math.min(current.fontScale, Math.min(1, 7 / Math.max(7, totalLyricLines)))
    : 1;
  return (
    <main className="presentation-page" aria-label={scheduleTitle}>
      <RealtimeRefresh subscriptions={[
        { table: "schedules", column: "id", value: scheduleId },
        { table: "schedule_items", column: "schedule_id", value: scheduleId },
        ...songIds.flatMap((songId) => [
          { table: "songs" as const, column: "id", value: songId },
          { table: "song_sections" as const, column: "song_id", value: songId },
        ]),
        ...(userId ? [{ table: "church_members" as const, column: "user_id", value: userId }] : []),
      ]} />
      {refreshing && <p role="status" style={{ margin: 0, padding: "8px 16px", color: "#ccc", background: "#171717", fontSize: 12 }}>Checking for presentation updates…</p>}
      {syncError && <p role="status" style={{ margin: 0, padding: "8px 16px", color: "#f1c97a", background: "#171717", fontSize: 12 }}>{syncError}</p>}
      <section
        className={`slide-stage${fullscreenImageUrl ? " slide-stage-image" : ""}`}
        aria-live="polite"
        onTouchStart={(event) => {
          const target = event.target;
          if (target instanceof Element && target.closest("button, a, input, textarea, select, [contenteditable=true]")) return;
          const touch = event.touches[0];
          touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          const target = event.target;
          const touch = event.changedTouches[0];
          if (!start || !touch || (target instanceof Element && target.closest("button, a, input, textarea, select, [contenteditable=true]"))) return;
          const targetIndex = getTouchSwipeSlideIndex(currentGroup?.slides ?? [], currentSlideIndex, start.x, start.y, touch.clientX, touch.clientY);
          if (targetIndex !== null) void moveSlide(targetIndex > currentSlideIndex ? 1 : -1);
        }}
        onTouchCancel={() => { touchStart.current = null; }}
      >
        {current && fullscreenImageUrl
          ? <img className="presentation-fullscreen-image" src={fullscreenImageUrl} alt={current.itemTitle} />
          : current ? <>
            {current.backgroundImageUrl && !hasLyrics && <img className="slide-background" src={current.backgroundImageUrl} alt="" />}
            <h1 className="slide-title">{current.itemTitle}</h1>
            <div className="slide-content">
              {current.mediaUrl && (isVideo
                ? <video className="slide-media" src={current.mediaUrl} controls playsInline />
                : <img className="slide-media" src={current.mediaUrl} alt={current.itemTitle} />)}
              {current.lines.length > 0 && <div className="slide-lyrics" style={{ fontSize: `clamp(${1.5 * lyricScale}rem, ${3 * lyricScale}vw, ${2.5 * lyricScale}rem)` }}>{current.lines.join("\n")}</div>}
              {current.translationLines?.length ? <div className="slide-translation">
                {current.translationLabel && <span>{current.translationLabel}</span>}
                <p style={{ fontSize: `clamp(${1.125 * lyricScale}rem, ${2.25 * lyricScale}vw, ${1.75 * lyricScale}rem)` }}>{current.translationLines.join("\n")}</p>
              </div> : null}
              {!current.lines.length && !current.translationLines?.length && !current.mediaUrl && <p className="slide-empty">No display content was added for this programme item.</p>}
            </div>
          </> : <p className="slide-empty">There are no slides in this service yet.</p>}
      </section>
      <nav className="presentation-bottom-controls" aria-label="Presentation slide navigation">
        <button type="button" onClick={() => { void moveSlide(-1); }} disabled={currentSlideIndex === 0 || (syncActive && !isOwner)} aria-label="Previous slide"><ChevronLeft size={21} /></button>
        <button type="button" onClick={() => navigate(`/slides?scheduleId=${encodeURIComponent(scheduleId)}`)} aria-label="Home: return to slide overview"><Home size={19} /></button>
        <button type="button" onClick={() => { void moveSlide(1); }} disabled={!currentGroup || currentSlideIndex === currentGroup.slides.length - 1 || (syncActive && !isOwner)} aria-label="Next slide"><ChevronRight size={21} /></button>
      </nav>
      <span className="presentation-slide-counter" aria-live="polite">{currentGroup ? `${currentSlideIndex + 1} / ${currentGroup.slides.length}` : "0 / 0"}</span>
    </main>
  );
}
