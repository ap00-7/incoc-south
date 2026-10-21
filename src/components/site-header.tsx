import Link from "next/link";
import { BookOpen, CalendarDays, MonitorPlay, ShieldCheck } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { BrandMark } from "@/components/brand-mark";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader({ owner = false }: { owner?: boolean }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="app-brand" href="/" aria-label="INCOC South home">
          <BrandMark />
          <span><strong>INCOC South</strong><small>Church in South Sector</small></span>
        </Link>
        <nav className="primary-nav" aria-label="Main navigation">
          <Link href="/song"><BookOpen size={15} aria-hidden="true" /> Songbook</Link>
          <Link href="/schedule"><CalendarDays size={15} aria-hidden="true" /> Schedule</Link>
          <Link href="/slides"><MonitorPlay size={15} aria-hidden="true" /> Slides</Link>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          {owner && <>
            <Link className="owner-session-label" href="/admin/songs"><ShieldCheck size={15} /> Owner</Link>
            <form action={signOut}>
              <PendingSubmitButton className="header-session-action" pendingLabel="Signing out…">Sign out</PendingSubmitButton>
            </form>
          </>}
        </div>
      </div>
    </header>
  );
}
