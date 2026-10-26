import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { PresentationViewer } from "pptx-wasm/react";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type PresentationDocumentViewerProps = {
  source: string;
  fileName: string | null;
  mimeType: string | null;
  pageIndex: number;
  onPageCount: (count: number) => void;
};

export function PresentationDocumentViewer({
  source,
  fileName,
  mimeType,
  pageIndex,
  onPageCount,
}: PresentationDocumentViewerProps) {
  const isPdf = mimeType === "application/pdf" || fileName?.toLowerCase().endsWith(".pdf");
  return isPdf
    ? <PdfDocumentViewer source={source} pageIndex={pageIndex} onPageCount={onPageCount} />
    : <PptxDocumentViewer source={source} pageIndex={pageIndex} onPageCount={onPageCount} />;
}

function PdfDocumentViewer({
  source,
  pageIndex,
  onPageCount,
}: Pick<PresentationDocumentViewerProps, "source" | "pageIndex" | "onPageCount">) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
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
        onLoadError={(loadError) => setError(`Unable to render this PDF presentation: ${loadError.message}`)}
      >
        {width > 0 && <Page
          pageNumber={pageIndex + 1}
          width={Math.min(width, 1600)}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />}
      </Document>
    </div>
  );
}

function PptxDocumentViewer({
  source,
  pageIndex,
  onPageCount,
}: Pick<PresentationDocumentViewerProps, "source" | "pageIndex" | "onPageCount">) {
  const [error, setError] = useState("");
  return (
    <div className="presentation-document-viewer">
      {error
        ? <p className="presentation-document-error" role="alert">{`Unable to render this PPTX presentation: ${error}`}</p>
        : <PresentationViewer
          src={source}
          slide={pageIndex}
          width="100%"
          height="100%"
          fit="contain"
          keyboard={false}
          loading={<p className="slide-empty" role="status">Loading PowerPoint presentation…</p>}
          onLoad={(info) => onPageCount(info.slideCount)}
          onError={(renderError) => setError(renderError.message)}
        />}
    </div>
  );
}
