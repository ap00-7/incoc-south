import Link from "next/link";
import { BookOpen, CalendarDays, LogIn, MonitorPlay } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

const nav = [
  { href: "/songbook", label: "Songs", icon: BookOpen },
  { href: "/schedule", label: "Sunday Schedule", icon: CalendarDays },
  { href: "/slides", label: "Slides", icon: MonitorPlay },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="INCOC South home">
          <BrandMark />
          <span><strong>INCOC South</strong><small>Indian Church of Christ · South Sector</small></span>
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
    </footer>
  );
}
