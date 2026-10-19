"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import { readOwnerSessionStatus } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/browser";
import type { OwnerSessionStatus as SessionStatus } from "@/lib/auth";

type ViewStatus = SessionStatus | "loading";

export function OwnerSessionStatus({ configured }: { configured: boolean }) {
  const [status, setStatus] = useState<ViewStatus>(configured ? "loading" : "unavailable");
  const [signOutPending, setSignOutPending] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!configured) return;
    let active = true;
    let generation = 0;
    let receivedInitialSession = false;
    let verificationTimeout: number | undefined;
    let verificationRequestTimeout: number | undefined;
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      const unavailableTimeout = window.setTimeout(() => {
        if (active) setStatus("unavailable");
      }, 0);
      return () => {
        active = false;
        window.clearTimeout(unavailableTimeout);
      };
    }
    const initialTimeout = window.setTimeout(() => {
      if (active && !receivedInitialSession) setStatus("unavailable");
    }, 10_000);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const requestGeneration = ++generation;
      receivedInitialSession = true;
      window.clearTimeout(initialTimeout);
      if (verificationTimeout !== undefined) window.clearTimeout(verificationTimeout);
      if (verificationRequestTimeout !== undefined) window.clearTimeout(verificationRequestTimeout);
      if (event === "SIGNED_OUT" || !session) {
        setStatus("signed-out");
        return;
      }

      setStatus((current) => current === "owner" && event === "TOKEN_REFRESHED" ? current : "loading");
      verificationTimeout = window.setTimeout(() => {
        if (active && generation === requestGeneration) setStatus("unavailable");
      }, 10_000);
      verificationRequestTimeout = window.setTimeout(() => {
        void readOwnerSessionStatus().then((nextStatus) => {
          if (active && generation === requestGeneration) {
            window.clearTimeout(verificationTimeout);
            setStatus(nextStatus);
          }
        }).catch(() => {
          if (active && generation === requestGeneration) {
            window.clearTimeout(verificationTimeout);
            setStatus("unavailable");
          }
        });
      }, 0);
    });

    return () => {
      active = false;
      window.clearTimeout(initialTimeout);
      if (verificationTimeout !== undefined) window.clearTimeout(verificationTimeout);
      if (verificationRequestTimeout !== undefined) window.clearTimeout(verificationRequestTimeout);
      subscription.unsubscribe();
    };
  }, [configured]);

  useEffect(() => {
    if (!pathname.startsWith("/admin")) return;
    if (status === "signed-out") router.replace("/login");
    if (status === "restricted") router.replace("/access-denied");
  }, [pathname, router, status]);

  async function handleSignOut() {
    setSignOutPending(true);
    try {
      const { error } = await createClient().auth.signOut();
      if (error) {
        setStatus("unavailable");
        setSignOutPending(false);
        return;
      }
      setStatus("signed-out");
      router.replace("/login");
      router.refresh();
    } catch {
      setStatus("unavailable");
      setSignOutPending(false);
    }
  }

  if (status === "owner") {
    return <div className="header-session-status">
      <Link className="owner-session-label" href="/admin"><ShieldCheck size={16} /> Owner signed in</Link>
      <button type="button" className="header-session-action" onClick={handleSignOut} disabled={signOutPending}>
        {signOutPending ? "Signing out…" : "Sign out"}
      </button>
    </div>;
  }

  if (status === "restricted") {
    return <div className="header-session-status">
      <Link className="owner-session-label" href="/access-denied">Signed in · no owner access</Link>
      <button type="button" className="header-session-action" onClick={handleSignOut} disabled={signOutPending}>
        {signOutPending ? "Signing out…" : "Sign out"}
      </button>
    </div>;
  }

  if (status === "signed-out" || !configured) {
    return <Link className="header-login" href="/login"><LogIn size={16} /> Sign in</Link>;
  }

  return <span className="header-session-neutral" role="status">
    {status === "unavailable" ? "Session status unavailable" : "Checking session…"}
  </span>;
}
