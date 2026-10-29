import { Link } from "react-router-dom";
import { BookOpen, CalendarDays } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

export function SiteHeader({ showNavigation }: { showNavigation: boolean }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="app-brand" to="/" aria-label="INCOC South home">
          <BrandMark />
          <span><strong>INCOC South</strong><small>Church in South Sector</small></span>
        </Link>
        {showNavigation && <nav className="primary-nav" aria-label="Main navigation">
          <Link to="/songs"><BookOpen size={15} aria-hidden="true" /> Songbook</Link>
          <Link to="/schedule"><CalendarDays size={15} aria-hidden="true" /> Schedule</Link>
        </nav>}
      </div>
    </header>
  );
}
