import { useState } from "react";
import { NavLink } from "react-router-dom";
import { BookOpen, CalendarDays, Menu, X } from "lucide-react";

export function SiteHeader({ showNavigation }: { showNavigation: boolean }) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  return (
    <header className="site-header site-header-navigation">
      <div className="header-inner">
        {showNavigation && <>
          <button
            className="mobile-nav-toggle"
            type="button"
            aria-label={mobileNavigationOpen ? "Close navigation" : "Open navigation"}
            aria-controls="primary-navigation"
            aria-expanded={mobileNavigationOpen}
            onClick={() => setMobileNavigationOpen((open) => !open)}
          >
            {mobileNavigationOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
          </button>
          <nav
            className="primary-nav"
            id="primary-navigation"
            aria-label="Main navigation"
            data-open={mobileNavigationOpen}
          >
            <NavLink to="/songs" onClick={() => setMobileNavigationOpen(false)}><BookOpen size={16} aria-hidden="true" /><span>Songbook</span></NavLink>
            <NavLink to="/schedule" onClick={() => setMobileNavigationOpen(false)}><CalendarDays size={16} aria-hidden="true" /><span>Schedule</span></NavLink>
          </nav>
        </>}
      </div>
    </header>
  );
}
