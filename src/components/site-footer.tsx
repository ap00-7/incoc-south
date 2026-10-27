import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/spa/auth-provider";

export function SiteFooter() {
  const { pathname, search } = useLocation();
  const { loading, user, membership, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const searchParams = new URLSearchParams(search);
  const footerSection = pathname === "/songs"
    ? "songbook"
    : pathname === "/announcement" || pathname === "/announcement/slides"
      ? "announcements"
      : pathname === "/schedule" || /^\/schedule\/[^/]+$/.test(pathname)
        ? "schedule"
        : pathname === "/slides" && !searchParams.get("scheduleId")
          ? "slides"
          : null;
  const canSignOut = Boolean(user && membership?.role === "owner");
  const returnTo = `${pathname}${search}`;

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      await signOut();
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Unable to sign out.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <footer className={`site-footer${footerSection ? ` site-footer-${footerSection}` : ""}`}>
      <span className="site-footer-copy">Indian Church of Christ · South Sector</span>
      {footerSection && !loading && <div className="site-footer-auth">
        {canSignOut
          ? <button type="button" className="footer-auth-action" onClick={() => void handleSignOut()} disabled={signingOut} aria-busy={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          : <Link className="footer-auth-action" to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>Sign in</Link>}
        {error && <span className="footer-auth-error" role="alert">{error}</span>}
      </div>}
    </footer>
  );
}
