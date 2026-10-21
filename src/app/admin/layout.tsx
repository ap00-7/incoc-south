import { connection } from "next/server";
import type { ReactNode } from "react";
import { PageShell } from "@/components/page-shell";
import { SiteHeader } from "@/components/site-header";
import { IntentPrefetchLink } from "@/components/intent-prefetch-link";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { requireOwner } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const instant = false;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await connection();
  if (!isSupabaseConfigured()) {
    return <PageShell><div className="content-wrap"><div className="notice notice-warning">Owner tools are unavailable until Supabase is configured. See the README for setup instructions.</div></div></PageShell>;
  }
  await requireOwner();
  return (
    <>
      <SiteHeader />
      <PageShell>
        <div className="admin-layout">
          <UnsavedChangesGuard />
          <aside className="admin-nav" aria-label="Owner navigation">
            <IntentPrefetchLink href="/admin/songs">Songs</IntentPrefetchLink>
            <IntentPrefetchLink href="/admin/schedules">Sunday Schedule &amp; Slides</IntentPrefetchLink>
          </aside>
          <section className="admin-content">{children}</section>
        </div>
      </PageShell>
    </>
  );
}
