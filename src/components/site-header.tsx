import Link from "next/link";
import { LogIn } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="INCOC South home">
          <BrandMark />
          <span><strong>INCOC South</strong><small>Indian Church of Christ · South Sector</small></span>
        </Link>
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
