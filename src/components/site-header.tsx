import { Link } from "react-router-dom";
import { BookOpen, CalendarDays, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { useAuth } from "@/spa/auth-provider";

export function SiteHeader({ owner = false, showNavigation }: { owner?: boolean; showNavigation: boolean }) {
  const auth = useAuth();
  const showOwner = owner || auth.membership?.role === "owner";

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="app-brand" to="/" aria-label="INCOC South home">
          <BrandMark />
          <span><strong>INCOC South</strong><small>Church in South Sector</small></span>
        </Link>
        {showNavigation && <nav className="primary-nav" aria-label="Main navigation">
          <Link to="/song"><BookOpen size={15} aria-hidden="true" /> Songbook</Link>
          <Link to="/schedule"><CalendarDays size={15} aria-hidden="true" /> Schedule</Link>
        </nav>}
        <div className="header-actions">
          {showOwner && <Link className="owner-session-label" to="/admin/songs"><ShieldCheck size={15} /> Owner</Link>}
        </div>
      </div>
      {auth.error && <p className="realtime-notice" role="alert">{auth.error}</p>}
    </header>
  );
}
