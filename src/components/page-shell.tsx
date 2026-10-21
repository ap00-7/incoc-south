import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export function PageShell({ children, owner = false }: { children: ReactNode; owner?: boolean }) {
  return (
    <>
      <SiteHeader owner={owner} />
      <main className="page-main">{children}</main>
      <SiteFooter />
    </>
  );
}

export function PageContentLoading({ title }: { title: string }) {
  return (
    <div className="content-wrap route-loading-shell" role="status" aria-busy="true">
      <p className="eyebrow">INCOC SOUTH</p>
      <h1 className="detail-title">{title}</h1>
      <span className="loading-line loading-line-wide" />
      <span className="loading-line" />
      <span className="loading-line loading-line-short" />
      <span className="sr-only">Loading content…</span>
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="section-heading">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {description && <p className="section-description">{description}</p>}
    </div>
  );
}
