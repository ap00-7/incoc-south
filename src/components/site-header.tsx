import { OwnerSessionStatus } from "@/components/owner-session-status";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <OwnerSessionStatus />
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
