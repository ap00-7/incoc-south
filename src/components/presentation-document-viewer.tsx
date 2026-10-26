import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Presentation as PptxPresentation } from "pptx-wasm";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type PresentationDocumentViewerProps = {
  source: string;
  fileName: string | null;
  mimeType: string | null;
  pageIndex: number;
  zoom: number;
  onPageCount: (count: number) => void;
};

export function PresentationDocumentViewer({
  source,
  fileName,
  mimeType,
  pageIndex,
  zoom,
  onPageCount,
}: PresentationDocumentViewerProps) {
  const isPdf = mimeType === "application/pdf" || fileName?.toLowerCase().endsWith(".pdf");
  return isPdf
    ? <PdfDocumentViewer source={source} pageIndex={pageIndex} onPageCount={onPageCount} />
    : <PptxDocumentViewer source={source} pageIndex={pageIndex} zoom={zoom} onPageCount={onPageCount} />;
}

function PdfDocumentViewer({
  source,
  pageIndex,
  onPageCount,
}: Pick<PresentationDocumentViewerProps, "source" | "pageIndex" | "onPageCount">) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const onLoadSuccess = useCallback((document: { numPages: number }) => {
    setPageCount(document.numPages);
    onPageCount(document.numPages);
    setError("");
  }, [onPageCount]);

  return (
    <div className="presentation-document-viewer" ref={container}>
      <Document
        file={source}
        loading={<p className="slide-empty" role="status">Loading PDF presentation…</p>}
        error={<p className="presentation-document-error" role="alert">{error || "Unable to render this PDF presentation."}</p>}
        onLoadSuccess={onLoadSuccess}
        onLoadError={(loadError) => setError(`Unable to render this PDF presentation: ${loadError.message || "The file could not be opened."}`)}
      >
        {width > 0 && [...new Set([pageIndex, pageIndex - 1, pageIndex + 1])]
          .filter((index) => index >= 0 && index < pageCount)
          .map((index) => <Page
            key={index + 1}
            className={index === pageIndex ? undefined : "presentation-pdf-preload-page"}
            pageNumber={index + 1}
            width={Math.min(width, 1600)}
            canvasBackground="#000"
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />)}
      </Document>
    </div>
  );
}

function PptxDocumentViewer({
  source,
  pageIndex,
  zoom,
  onPageCount,
}: Pick<PresentationDocumentViewerProps, "source" | "pageIndex" | "zoom" | "onPageCount">) {
  const frame = useRef<HTMLDivElement>(null);
  const prepareRef = useRef<((startIndex: number) => Promise<void>) | null>(null);
  const pendingAssetCleanup = useRef<(() => void) | null>(null);
  const cachedSlides = useRef<Array<HTMLCanvasElement | undefined>>([]);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [slideCount, setSlideCount] = useState(0);
  const [preparedCount, setPreparedCount] = useState(0);
  const [failedSlide, setFailedSlide] = useState<number | null>(null);
  const [presentationReady, setPresentationReady] = useState(false);
  const [retryOpenVersion, setRetryOpenVersion] = useState(0);
  const [error, setError] = useState("");
  const onPageCountRef = useRef(onPageCount);
  onPageCountRef.current = onPageCount;

  useEffect(() => {
    const abortController = new AbortController();
    let active = true;
    let presentation: PptxPresentation | null = null;
    cachedSlides.current = [];
    setCacheVersion(0);
    setSlideCount(0);
    setPreparedCount(0);
    setFailedSlide(null);
    setPresentationReady(false);
    setError("");
    if (frame.current) frame.current.replaceChildren();

    const prepareFrom = async (deck: PptxPresentation, startIndex: number) => {
      if (!active) return;
      setError("");
      setFailedSlide(null);
      for (let index = startIndex; index < deck.slideCount; index += 1) {
        if (!active) return;
        if (cachedSlides.current[index]) continue;
        let canvas: HTMLCanvasElement | undefined;
        try {
          const aspectRatio = deck.slideSize.width / deck.slideSize.height;
          const perSlidePixelBudget = Math.min(1_920 * 1_080, Math.floor(48_000_000 / deck.slideCount));
          const maxWidth = Math.min(1_920, Math.floor(Math.sqrt(perSlidePixelBudget * aspectRatio)));
          const maxHeight = Math.min(1_080, Math.floor(Math.sqrt(perSlidePixelBudget / aspectRatio)));
          const scale = Math.min(maxWidth / deck.slideSize.width, maxHeight / deck.slideSize.height);
          canvas = window.document.createElement("canvas");
          canvas.width = Math.max(1, Math.floor(deck.slideSize.width * scale));
          canvas.height = Math.max(1, Math.floor(deck.slideSize.height * scale));
          let complete = false;
          while (!complete) {
            let unsubscribe = () => {};
            let resolveAssets = () => {};
            const assetsReady = new Promise<void>((resolve) => {
              resolveAssets = resolve;
              unsubscribe = deck.onAssetsReady(resolve);
              pendingAssetCleanup.current = () => {
                unsubscribe();
                resolveAssets();
              };
            });
            try {
              const result = await deck.render(index, canvas, {
                width: canvas.width,
                height: canvas.height,
                dpr: 1,
                fit: "contain",
              });
              complete = result.complete;
            } catch (renderError) {
              unsubscribe();
              pendingAssetCleanup.current = null;
              throw renderError;
            }
            if (complete) {
              unsubscribe();
              pendingAssetCleanup.current = null;
            } else {
              await assetsReady;
              unsubscribe();
              pendingAssetCleanup.current = null;
            }
          }
          if (!active) {
            canvas.width = 0;
            canvas.height = 0;
            return;
          }
          cachedSlides.current[index] = canvas;
          setPreparedCount((count) => count + 1);
          setCacheVersion((version) => version + 1);
          await new Promise<void>((resolve) => window.requestAnimationFrame(
            () => window.requestAnimationFrame(() => resolve()),
          ));
        } catch (renderError) {
          if (!active) return;
          if (canvas && !cachedSlides.current[index]) {
            canvas.width = 0;
            canvas.height = 0;
          }
          setFailedSlide(index);
          setError(renderError instanceof Error ? renderError.message : "The slide could not be prepared.");
          return;
        }
      }
    };

    void PptxPresentation.open(source, { signal: abortController.signal }).then((opened) => {
      if (!active) {
        opened.destroy();
        return;
      }
      presentation = opened;
      prepareRef.current = (startIndex) => prepareFrom(opened, startIndex);
      setPresentationReady(true);
      setSlideCount(opened.slideCount);
      onPageCountRef.current(opened.slideCount);
      if (opened.slideCount === 0) {
        setError("The PowerPoint file contains no slides.");
        return;
      }
      void prepareFrom(opened, 0);
    }).catch((loadError: unknown) => {
      if (!active || abortController.signal.aborted) return;
      setFailedSlide(0);
      setError(loadError instanceof Error ? loadError.message : "The PowerPoint file could not be opened.");
    });

    return () => {
      active = false;
      abortController.abort();
      prepareRef.current = null;
      pendingAssetCleanup.current?.();
      pendingAssetCleanup.current = null;
      presentation?.destroy();
      for (const canvas of cachedSlides.current) {
        if (!canvas) continue;
        canvas.width = 0;
        canvas.height = 0;
      }
      cachedSlides.current = [];
      if (frame.current) frame.current.replaceChildren();
    };
  }, [retryOpenVersion, source]);

  useLayoutEffect(() => {
    const canvas = cachedSlides.current[pageIndex];
    if (!frame.current) return;
    if (canvas) {
      canvas.className = "presentation-cached-slide";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `Slide ${pageIndex + 1} of ${slideCount}`);
      canvas.style.maxWidth = `${100 / zoom}%`;
      canvas.style.maxHeight = `${100 / zoom}%`;
      canvas.style.transform = `scale(${zoom})`;
      if (frame.current.firstChild !== canvas) frame.current.replaceChildren(canvas);
    } else if (frame.current.childNodes.length > 0) {
      frame.current.replaceChildren();
    }
  }, [cacheVersion, pageIndex, slideCount, zoom]);

  return (
    <div className="presentation-document-viewer">
      <div className="presentation-canvas-mount" ref={container}>
        <div className="presentation-canvas-frame" ref={frame} style={{
          width: `${Math.max(1, zoom) * 100}%`,
          height: `${Math.max(1, zoom) * 100}%`,
        }} />
      </div>
      {!cachedSlides.current[pageIndex] && !error && <p className="slide-empty" role="status">
        {slideCount ? `Preparing slide ${pageIndex + 1} of ${slideCount}…` : "Loading PowerPoint presentation…"}
      </p>}
      {preparedCount < slideCount && slideCount > 1 && !error && <span
        role="status"
        style={{ position: "absolute", top: 12, right: 16, zIndex: 3, color: "#eadbca", fontSize: 12, opacity: 0.72, pointerEvents: "none" }}
      >Preparing slides {preparedCount} of {slideCount}</span>}
      {error && <div className="presentation-document-error" role="alert">
        <p>Unable to prepare PowerPoint slide {failedSlide === null ? "" : `${failedSlide + 1}: `}{error}</p>
        {failedSlide !== null && <button type="button" onClick={() => {
          if (presentationReady) {
            setError("");
            void prepareRef.current?.(failedSlide);
          } else {
            setRetryOpenVersion((version) => version + 1);
          }
        }}>Retry slide preparation</button>}
      </div>}
    </div>
  );
}
