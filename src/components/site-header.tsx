import Link from "next/link";
import { BookOpen, CalendarDays, Church, LogIn } from "lucide-react";

const nav = [
  { href: "/songbook", label: "Songbook", icon: BookOpen },
  { href: "/schedule", label: "Services", icon: CalendarDays },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="INCOC South home">
          <span className="brand-mark"><Church size={20} strokeWidth={1.7} /></span>
          <span><strong>INCOC South</strong><small>Indian Church of Christ</small></span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link href={href} key={href}><Icon size={16} />{label}</Link>
          ))}
        </nav>
        <Link className="header-login" href="/login"><LogIn size={16} /> Sign in</Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>Indian Church of Christ · South Sector</span>
      <span>Worship · Fellowship · Service</span>
    </footer>
  );
}
