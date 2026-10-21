import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Home } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { clampSlideIndex, getAdjacentItemSlideIndex, type PresentationSlide } from "@/lib/domain/slides";
import { RealtimeRefresh } from "@/components/realtime-refresh";

export function Presentation({
  scheduleId,
  scheduleTitle,
  initialSlide,
  slides,
  isOwner,
  canReadSession,
  userId,
  songIds,
}: {
  scheduleId: string;
  scheduleTitle: string;
  initialSlide: number;
  slides: PresentationSlide[];
  isOwner: boolean;
  canReadSession: boolean;
  userId: string | null;
  songIds: string[];
}) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(() =>
    clampSlideIndex(initialSlide, slides.length),
  );
  const [syncActive, setSyncActive] = useState(false);
  const [syncError, setSyncError] = useState("");
  const touchStartX = useRef<number | null>(null);
  const currentIndex = clampSlideIndex(index, slides.length);
  const previousItemIndex = getAdjacentItemSlideIndex(slides, currentIndex, -1);
  const nextItemIndex = getAdjacentItemSlideIndex(slides, currentIndex, 1);

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
      } else if (event.key === "Home") {
        event.preventDefault();
        navigate(`/slides?scheduleId=${encodeURIComponent(scheduleId)}`);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentIndex, goTo, navigate, scheduleId]);

  const current = slides[currentIndex];
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
      {syncError && <p role="status" style={{ margin: 0, padding: "8px 16px", color: "#f1c97a", background: "#171717", fontSize: 12 }}>{syncError}</p>}
      <section
        className="slide-stage"
        aria-live="polite"
        onTouchStart={(event) => {
          const target = event.target;
          if (target instanceof Element && target.closest("button, a, input, textarea, select, [contenteditable=true]")) return;
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const startX = touchStartX.current;
          touchStartX.current = null;
          const target = event.target;
          const endX = event.changedTouches[0]?.clientX;
          if (startX === null || endX === undefined || (target instanceof Element && target.closest("button, a, input, textarea, select, [contenteditable=true]"))) return;
          const difference = endX - startX;
          if (difference < -50) void goTo(currentIndex + 1);
          else if (difference > 50) void goTo(currentIndex - 1);
        }}
        onTouchCancel={() => { touchStartX.current = null; }}
      >
        {current ? <>
            {current.backgroundImageUrl && !hasLyrics && <img className="slide-background" src={current.backgroundImageUrl} alt="" />}
            <h1 className="slide-title">{current.itemTitle}</h1>
            <div className="slide-content">
              {current.mediaUrl && (/\.(mp4|webm)(?:$|\?)/i.test(current.mediaUrl)
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
      <nav className="presentation-bottom-controls" aria-label="Presentation item navigation">
        <button type="button" onClick={() => { if (previousItemIndex !== null) void goTo(previousItemIndex); }} disabled={previousItemIndex === null || (syncActive && !isOwner)} aria-label="Previous item"><ChevronLeft size={21} /></button>
        <button type="button" onClick={() => navigate(`/slides?scheduleId=${encodeURIComponent(scheduleId)}`)} aria-label="Home: return to slide overview"><Home size={19} /></button>
        <button type="button" onClick={() => { if (nextItemIndex !== null) void goTo(nextItemIndex); }} disabled={nextItemIndex === null || (syncActive && !isOwner)} aria-label="Next item"><ChevronRight size={21} /></button>
      </nav>
      <span className="presentation-slide-counter" aria-live="polite">{slides.length ? `${currentIndex + 1} / ${slides.length}` : "0 / 0"}</span>
    </main>
  );
}
