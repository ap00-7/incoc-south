"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import { readOwnerSessionStatus } from "@/app/actions/auth";
import type { OwnerSessionStatus as SessionStatus } from "@/lib/auth";

type ViewStatus = SessionStatus | "loading";
type SessionContextValue = {
  configured: boolean;
  status: ViewStatus;
  signOutPending: boolean;
  signOutError: string;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function OwnerSessionProvider({ configured, children }: { configured: boolean; children: ReactNode }) {
  const [status, setStatus] = useState<ViewStatus>(configured ? "loading" : "unavailable");
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!configured) return;
    let active = true;
    let generation = 0;
    let receivedInitialSession = false;
    let ownerVerified = false;
    let verificationTimeout: number | undefined;
    let verificationRequestTimeout: number | undefined;
    let subscription: { unsubscribe: () => void } | undefined;
    const initialTimeout = window.setTimeout(() => {
      if (active && !receivedInitialSession) setStatus("unavailable");
    }, 10_000);
    void import("@/lib/supabase/browser").then(({ createClient }) => {
      if (!active) return;
      const supabase = createClient();
      const result = supabase.auth.onAuthStateChange((event, session) => {
        const requestGeneration = ++generation;
        receivedInitialSession = true;
        window.clearTimeout(initialTimeout);
        if (verificationTimeout !== undefined) window.clearTimeout(verificationTimeout);
        if (verificationRequestTimeout !== undefined) window.clearTimeout(verificationRequestTimeout);
        if (event === "SIGNED_OUT" || !session) {
          ownerVerified = false;
          setStatus("signed-out");
          return;
        }
        if (event === "TOKEN_REFRESHED" && ownerVerified) return;

        setStatus("loading");
        verificationTimeout = window.setTimeout(() => {
          if (active && generation === requestGeneration) setStatus("unavailable");
        }, 10_000);
        verificationRequestTimeout = window.setTimeout(() => {
          void readOwnerSessionStatus().then((nextStatus) => {
            if (active && generation === requestGeneration) {
              window.clearTimeout(verificationTimeout);
              ownerVerified = nextStatus === "owner";
              setStatus(nextStatus);
            }
          }).catch(() => {
            if (active && generation === requestGeneration) {
              window.clearTimeout(verificationTimeout);
              ownerVerified = false;
              setStatus("unavailable");
            }
          });
        }, 0);
      });
      subscription = result.data.subscription;
    }).catch(() => {
      if (active) setStatus("unavailable");
    });

    return () => {
      active = false;
      window.clearTimeout(initialTimeout);
      if (verificationTimeout !== undefined) window.clearTimeout(verificationTimeout);
      if (verificationRequestTimeout !== undefined) window.clearTimeout(verificationRequestTimeout);
      subscription?.unsubscribe();
    };
  }, [configured]);

  useEffect(() => {
    if (!pathname.startsWith("/admin")) return;
    if (status === "signed-out") router.replace("/login");
    if (status === "restricted") router.replace("/access-denied");
  }, [pathname, router, status]);

  async function signOut() {
    setSignOutPending(true);
    setSignOutError("");
    try {
      const { createClient } = await import("@/lib/supabase/browser");
      const { error } = await createClient().auth.signOut();
      if (error) {
        setStatus("unavailable");
        setSignOutError(`Unable to sign out: ${error.message}`);
        setSignOutPending(false);
        return;
      }
      setStatus("signed-out");
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setStatus("unavailable");
      setSignOutError(error instanceof Error ? `Unable to sign out: ${error.message}` : "Unable to sign out.");
      setSignOutPending(false);
    }
  }

  return <SessionContext.Provider value={{ configured, status, signOutPending, signOutError, signOut }}>{children}</SessionContext.Provider>;
}

export function OwnerSessionStatus() {
  const session = useContext(SessionContext);
  if (!session) return <span className="header-session-neutral" role="status">Checking session…</span>;
  const { configured, status, signOutPending, signOutError, signOut } = session;

  if (status === "owner") {
    return <div className="header-session-status">
      <Link className="owner-session-label" href="/songbook"><ShieldCheck size={15} /> Owner</Link>
      <button type="button" className="header-session-action" onClick={() => void signOut()} disabled={signOutPending}>
        {signOutPending ? "Signing out…" : "Sign out"}
      </button>
      {signOutError && <span className="session-error" role="alert">{signOutError}</span>}
    </div>;
  }

  if (status === "restricted") {
    return <div className="header-session-status">
      <Link className="owner-session-label" href="/access-denied">Signed in · no owner access</Link>
      <button type="button" className="header-session-action" onClick={() => void signOut()} disabled={signOutPending}>
        {signOutPending ? "Signing out…" : "Sign out"}
      </button>
      {signOutError && <span className="session-error" role="alert">{signOutError}</span>}
    </div>;
  }

  if (status === "signed-out" || !configured) {
    return <Link className="header-login" href="/login"><LogIn size={16} /> Sign in</Link>;
  }

  return <span className="header-session-neutral" role="status">
    {signOutError || (status === "unavailable" ? "Session status unavailable" : "Checking session…")}
  </span>;
}
