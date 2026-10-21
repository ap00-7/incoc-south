import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, CalendarDays, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/spa/auth-provider";

export function SiteHeader({ owner = false }: { owner?: boolean }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const showOwner = owner || auth.membership?.role === "owner";

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      await auth.signOut();
      navigate("/login", { replace: true });
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Unable to sign out.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="app-brand" to="/" aria-label="INCOC South home">
          <BrandMark />
          <span><strong>INCOC South</strong><small>Church in South Sector</small></span>
        </Link>
        <nav className="primary-nav" aria-label="Main navigation">
          <Link to="/song"><BookOpen size={15} aria-hidden="true" /> Songbook</Link>
          <Link to="/schedule"><CalendarDays size={15} aria-hidden="true" /> Schedule</Link>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          {showOwner && <>
            <Link className="owner-session-label" to="/admin/songs"><ShieldCheck size={15} /> Owner</Link>
            <button className="header-session-action" type="button" onClick={() => void handleSignOut()} disabled={signingOut} aria-busy={signingOut}>
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </>}
        </div>
      </div>
      {(error || auth.error) && <p className="realtime-notice" role="alert">{error || auth.error}</p>}
    </header>
  );
}
