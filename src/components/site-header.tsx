import Link from "next/link";
import { OwnerSessionStatus } from "@/components/owner-session-status";
import { BrandMark } from "@/components/brand-mark";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="INCOC South home">
          <BrandMark />
          <span><strong>INCOC South</strong><small>Indian Church of Christ · South Sector</small></span>
        </Link>
        <OwnerSessionStatus configured={isSupabaseConfigured()} />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>Indian Church of Christ · South Sector</span>
    </footer>
  );
}
