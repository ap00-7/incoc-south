import { Link, NavLink } from "react-router-dom";
import { BookOpen, CalendarDays, Megaphone } from "lucide-react";
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
          <NavLink to="/songs"><BookOpen size={16} aria-hidden="true" /><span>Songbook</span></NavLink>
          <NavLink to="/schedule"><CalendarDays size={16} aria-hidden="true" /><span>Schedule</span></NavLink>
          <NavLink to="/announcement" aria-label="Announcements"><Megaphone size={16} aria-hidden="true" /><span>Updates</span></NavLink>
        </nav>}
      </div>
    </header>
  );
}
