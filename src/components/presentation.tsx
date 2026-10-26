import { Component, type ErrorInfo, type ReactNode, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Home } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { clampSlideIndex, getTouchSwipeSlideIndex, groupPresentationSlides, type PresentationSlide } from "@/lib/domain/slides";
import { RealtimeRefresh } from "@/components/realtime-refresh";

const PresentationDocumentViewer = lazy(() => import("@/components/presentation-document-viewer")
  .then((module) => ({ default: module.PresentationDocumentViewer })));

class PresentationRendererErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Presentation renderer failed to initialize.", error, info);
  }

  render() {
    if (this.state.error) {
      return <p className="presentation-document-error" role="alert">
        Unable to initialize the presentation renderer: {this.state.error.message || "An unexpected error occurred."}
      </p>;
    }
    return this.props.children;
  }
}

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
}: {
  scheduleId: string;
  scheduleTitle: string;
  refreshing: boolean;
  initialSlide: number;
  slides: PresentationSlide[];
  isOwner: boolean;
  canReadSession: boolean;
  userId: string | null;
}) {
  const navigate = useNavigate();
  const groups = useMemo(() => groupPresentationSlides(slides), [slides]);
  const initialPosition = getPresentationPosition(groups, initialSlide);
  const [selectedItemIndex, setSelectedItemIndex] = useState(initialPosition.itemIndex);
  const [slideIndex, setSlideIndex] = useState(initialPosition.slideIndex);
  const [lyricsZoom, setLyricsZoom] = useState(1);
  const [syncActive, setSyncActive] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [documentPageInfo, setDocumentPageInfo] = useState<{ sourceKey: string; count: number }>({ sourceKey: "", count: 0 });
  const swipeStart = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const positionRef = useRef<PresentationPosition>(initialPosition);
  const currentGroupIndex = clampSlideIndex(selectedItemIndex, groups.length);
  const currentGroup = groups[currentGroupIndex];
  const isDocument = currentGroup?.itemType === "presentation";
  const documentSourceKey = isDocument ? `${currentGroup.itemId}:${currentGroup.slides[0]?.mediaUrl ?? ""}` : "";
  const documentSourceKeyRef = useRef(documentSourceKey);
  documentSourceKeyRef.current = documentSourceKey;
  const documentPageCount = isDocument && documentPageInfo.sourceKey === documentSourceKey ? documentPageInfo.count : 0;
  const visibleSlideCount = isDocument ? documentPageCount : currentGroup?.slides.length ?? 0;
  const currentSlideIndex = clampSlideIndex(slideIndex, visibleSlideCount);
  const current = currentGroup?.slides[isDocument ? 0 : currentSlideIndex];
  const previousDocumentSource = useRef({ itemId: isDocument ? currentGroup.itemId : "", sourceKey: documentSourceKey });

  useEffect(() => {
    if (!documentSourceKey) return;
    if (previousDocumentSource.current.itemId === currentGroup?.itemId
      && previousDocumentSource.current.sourceKey
      && previousDocumentSource.current.sourceKey !== documentSourceKey) {
      const nextPosition = { itemIndex: currentGroupIndex, slideIndex: 0 };
      positionRef.current = nextPosition;
      setSlideIndex(0);
    }
    previousDocumentSource.current = { itemId: currentGroup?.itemId ?? "", sourceKey: documentSourceKey };
    setDocumentPageInfo((currentInfo) => currentInfo.sourceKey === documentSourceKey
      ? currentInfo
      : { sourceKey: documentSourceKey, count: 0 });
  }, [currentGroup?.itemId, currentGroupIndex, documentSourceKey]);
  const isVideo = Boolean(current?.mediaUrl && /\.(mp4|webm)(?:$|\?)/i.test(current.mediaUrl));
  const isScripture = current?.itemType === "scripture_reading";
  const fullscreenImageUrl = current && !isVideo && !isScripture && !isDocument
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
        .select("current_item_id, current_slide_index, is_active").eq("schedule_id", scheduleId).maybeSingle();
      if (!alive) return;
      if (error) {
        setSyncError(`Could not refresh shared presentation state: ${error.message}`);
      } else if (data) {
        setSyncError((current) => current.startsWith("Could not refresh shared presentation state:") ? "" : current);
        setSyncActive(data.is_active);
        if (data.is_active) {
          const itemIndex = groups.findIndex((group) => group.itemId === data.current_item_id);
          const group = itemIndex >= 0 ? groups[itemIndex] : null;
          const position = group
            ? {
              itemIndex,
              slideIndex: group.itemType === "presentation"
                ? Math.max(0, data.current_slide_index - group.firstSlideIndex)
                : clampSlideIndex(data.current_slide_index - group.firstSlideIndex, group.slides.length),
            }
            : getPresentationPosition(groups, data.current_slide_index);
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

  const moveItem = useCallback(async (direction: -1 | 1) => {
    if (syncActive && !isOwner) return;
    const nextItemIndex = positionRef.current.itemIndex + direction;
    const group = groups[nextItemIndex];
    if (!group) return;
    const nextPosition = { itemIndex: nextItemIndex, slideIndex: 0 };
    positionRef.current = nextPosition;
    setSelectedItemIndex(nextItemIndex);
    setSlideIndex(0);
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
        current_slide_index: group.firstSlideIndex,
        updated_by: userId,
      })
      .eq("schedule_id", scheduleId);
    if (error) setSyncError(`Item changed locally, but could not update the shared presentation: ${error.message}`);
  }, [groups, isOwner, scheduleId, syncActive, userId]);

  const moveSlide = useCallback(async (direction: -1 | 1) => {
    if (syncActive && !isOwner) return;
    const currentPosition = positionRef.current;
    const itemIndex = clampSlideIndex(currentPosition.itemIndex, groups.length);
    const group = groups[itemIndex];
    if (!group) return;
    const isCurrentDocument = group.itemType === "presentation";
    const pageCount = isCurrentDocument && documentPageInfo.sourceKey === `${group.itemId}:${group.slides[0]?.mediaUrl ?? ""}`
      ? documentPageInfo.count
      : isCurrentDocument ? 0 : group.slides.length;
    if (isCurrentDocument && pageCount === 0) return;
    const safeIndex = clampSlideIndex(currentPosition.slideIndex + direction, pageCount);
    if (safeIndex === currentPosition.slideIndex) {
      if (isCurrentDocument) await moveItem(direction);
      return;
    }
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
  }, [documentPageInfo, groups, isOwner, moveItem, scheduleId, syncActive, userId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))) return;
      if (event.ctrlKey && !event.metaKey && !event.altKey) {
        const zoomDirection = event.key === "+" || event.key === "="
          ? 1
          : event.key === "-" || event.key === "_"
            ? -1
            : 0;
        if (zoomDirection || event.key === "0") {
          event.preventDefault();
          if (event.repeat) return;
          if (event.key === "0") {
            setLyricsZoom(1);
          } else {
            setLyricsZoom((zoom) => Math.min(2.5, Math.max(0.5, Math.round((zoom + zoomDirection * 0.1) * 10) / 10)));
          }
          return;
        }
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
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
  const zoomedLyricScale = lyricScale * lyricsZoom;
  return (
    <main
      className="presentation-page"
      aria-label={scheduleTitle}
      onPointerDown={(event) => {
        if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
        const target = event.target;
        if (target instanceof Element && target.closest("button, a, input, textarea, select, video, audio, [contenteditable=true]")) return;
        swipeStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        const start = swipeStart.current;
        swipeStart.current = null;
        if (!start || start.pointerId !== event.pointerId) return;
        if (isDocument) {
          const deltaX = event.clientX - start.x;
          const deltaY = event.clientY - start.y;
          if (Math.abs(deltaX) >= 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
            void moveSlide(deltaX < 0 ? 1 : -1);
          }
        } else {
          const targetIndex = getTouchSwipeSlideIndex(currentGroup?.slides ?? [], currentSlideIndex, start.x, start.y, event.clientX, event.clientY);
          if (targetIndex !== null) void moveSlide(targetIndex > currentSlideIndex ? 1 : -1);
        }
      }}
      onPointerCancel={() => { swipeStart.current = null; }}
    >
      <RealtimeRefresh subscriptions={[
        { table: "schedules", column: "id", value: scheduleId },
        { table: "schedule_items", column: "schedule_id", value: scheduleId },
        ...(userId ? [{ table: "church_members" as const, column: "user_id", value: userId }] : []),
      ]} onDelete={(deletedId) => {
        if (deletedId === scheduleId) navigate("/slides", { replace: true });
      }} />
      {refreshing && <p role="status" style={{ margin: 0, padding: "8px 16px", color: "#ccc", background: "#171717", fontSize: 12 }}>Checking for presentation updates…</p>}
      {syncError && <p role="status" style={{ margin: 0, padding: "8px 16px", color: "#f1c97a", background: "#171717", fontSize: 12 }}>{syncError}</p>}
      <section
        className={`slide-stage${fullscreenImageUrl ? " slide-stage-image" : ""}${isScripture ? " slide-stage-scripture" : ""}${isDocument ? " slide-stage-document" : ""}`}
        aria-live="polite"
      >
        {current && fullscreenImageUrl
          ? <img className="presentation-fullscreen-image" src={fullscreenImageUrl} alt={current.itemTitle} />
          : current && isDocument ? <>
            <h1 className="slide-title">{current.itemTitle}</h1>
            {current.mediaUrl
              ? <PresentationRendererErrorBoundary key={documentSourceKey}>
                <Suspense fallback={<p className="slide-empty" role="status">Loading presentation renderer…</p>}>
                  <PresentationDocumentViewer
                    source={current.mediaUrl}
                    fileName={current.presentationFileName ?? null}
                    mimeType={current.presentationMimeType ?? null}
                    pageIndex={currentSlideIndex}
                    onPageCount={(count) => {
                      if (documentSourceKeyRef.current !== documentSourceKey) return;
                      setDocumentPageInfo((currentInfo) => (
                        currentInfo.sourceKey === documentSourceKey && currentInfo.count === count
                          ? currentInfo
                          : { sourceKey: documentSourceKey, count }
                      ));
                    }}
                  />
                </Suspense>
              </PresentationRendererErrorBoundary>
              : <p className="presentation-document-error" role="alert">This presentation has no file URL. Re-upload the PDF or PowerPoint file.</p>}
          </>
          : current && isScripture ? <>
            {current.backgroundImageUrl && <img className="scripture-slide-background" src={current.backgroundImageUrl} alt="" />}
            {current.backgroundImageUrl && <div className="scripture-slide-overlay" />}
            <h1 className="slide-title">Scripture</h1>
            <div className="scripture-slide-content">
              {current.lines.length
                ? <p className="scripture-slide-text" style={{
                  fontSize: `clamp(${1.35 * current.fontScale}rem, ${3.1 * current.fontScale}vw, ${2.8 * current.fontScale}rem)`,
                }}>{current.lines.join("\n")}</p>
                : <p className="slide-empty">No scripture text has been added.</p>}
            </div>
          </>
          : current ? <>
            {current.backgroundImageUrl && !hasLyrics && <img className="slide-background" src={current.backgroundImageUrl} alt="" />}
            <h1 className="slide-title">{current.itemTitle}</h1>
            <div className="slide-content">
              {current.mediaUrl && (isVideo
                ? <video className="slide-media" src={current.mediaUrl} controls playsInline />
                : <img className="slide-media" src={current.mediaUrl} alt={current.itemTitle} />)}
              {hasLyrics && <div className="slide-lyric-area">
                {current.lines.length > 0 && <div className="slide-lyrics" style={{ fontSize: `clamp(${1.5 * zoomedLyricScale}rem, ${3 * zoomedLyricScale}vw, ${2.5 * zoomedLyricScale}rem)` }}>{current.lines.join("\n")}</div>}
                {current.translationLines?.length ? <div className="slide-translation">
                  <p className="slide-lyrics" style={{ fontSize: `clamp(${1.5 * zoomedLyricScale}rem, ${3 * zoomedLyricScale}vw, ${2.5 * zoomedLyricScale}rem)` }}>{current.translationLines.join("\n")}</p>
                </div> : null}
              </div>}
              {!current.lines.length && !current.translationLines?.length && !current.mediaUrl && <p className="slide-empty">No display content was added for this programme item.</p>}
            </div>
          </> : <p className="slide-empty">There are no slides in this service yet.</p>}
      </section>
      <nav className="presentation-bottom-controls" aria-label="Presentation item navigation">
        <button
          type="button"
          onClick={() => { void (isDocument ? moveSlide(-1) : moveItem(-1)); }}
          disabled={isDocument
            ? (documentPageCount === 0 || (currentSlideIndex === 0 && currentGroupIndex === 0) || (syncActive && !isOwner))
            : currentGroupIndex === 0 || (syncActive && !isOwner)}
          aria-label={isDocument ? "Previous page" : "Previous item"}
        ><ChevronLeft size={21} /></button>
        <button type="button" onClick={() => navigate(`/slides?scheduleId=${encodeURIComponent(scheduleId)}`)} aria-label="Home: return to slide overview"><Home size={19} /></button>
        <button
          type="button"
          onClick={() => { void (isDocument ? moveSlide(1) : moveItem(1)); }}
          disabled={isDocument
            ? (documentPageCount === 0 || (currentSlideIndex >= documentPageCount - 1 && currentGroupIndex >= groups.length - 1) || (syncActive && !isOwner))
            : currentGroupIndex >= groups.length - 1 || (syncActive && !isOwner)}
          aria-label={isDocument ? "Next page" : "Next item"}
        ><ChevronRight size={21} /></button>
      </nav>
      <span className="presentation-slide-counter" aria-live="polite">{currentGroup ? `${currentSlideIndex + 1} / ${visibleSlideCount || "…"}` : "0 / 0"}</span>
    </main>
  );
}
