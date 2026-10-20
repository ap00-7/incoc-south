import { PageShell } from "@/components/page-shell";

export default function Loading() {
  return (
    <PageShell>
      <div className="content-wrap route-loading-shell" role="status" aria-busy="true">
        <p className="eyebrow">INCOC SOUTH</p>
        <h1 className="detail-title">Loading page</h1>
        <span className="loading-line loading-line-wide" />
        <span className="loading-line" />
        <span className="loading-line loading-line-short" />
        <span className="sr-only">Loading page content…</span>
      </div>
    </PageShell>
  );
}