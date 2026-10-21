import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { setAuthSnapshot, type AuthMembership } from "@/lib/auth-client";

export type Membership = AuthMembership;

type AuthState = {
  configured: boolean;
  loading: boolean;
  error: string;
  session: Session | null;
  user: User | null;
  membership: Membership | null;
  refreshMembership: () => Promise<void>;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const config = getSupabasePublicConfig();
  const configured = Boolean(config.url && config.key);
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState("");

  const loadMembership = useCallback(async (userId: string | null) => {
    if (!userId) {
      setMembership(null);
      setAuthSnapshot(null, null);
      return;
    }
    const { data, error: membershipError } = await createClient()
      .from("church_members")
      .select("church_id, role, church:churches!inner(slug)")
      .eq("user_id", userId)
      .eq("church.slug", "incoc-south")
      .maybeSingle();
    if (membershipError) throw new Error(`Unable to verify church membership: ${membershipError.message}`);
    const currentMembership = data ? { churchId: data.church_id, role: data.role } : null;
    setMembership(currentMembership);
    setAuthSnapshot(userId, currentMembership);
  }, []);

  const acceptSession = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    setError("");
    setLoading(true);
    try {
      await loadMembership(nextSession?.user.id ?? null);
    } catch (membershipError) {
      setMembership(null);
      setAuthSnapshot(nextSession?.user.id ?? null, null);
      setError(membershipError instanceof Error ? membershipError.message : "Unable to verify church membership.");
    } finally {
      setLoading(false);
    }
  }, [loadMembership]);

  useEffect(() => {
    if (!configured) return;
    const supabase = createClient();
    let active = true;
    let currentUserId: string | null | undefined;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => {
        if (!active) return;
        const nextUserId = nextSession?.user.id ?? null;
        setSession(nextSession);
        if (currentUserId !== nextUserId) {
          currentUserId = nextUserId;
          void acceptSession(nextSession);
        } else {
          setLoading(false);
        }
      }, 0);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [acceptSession, configured]);

  const refreshMembership = useCallback(async () => {
    try {
      await loadMembership(session?.user.id ?? null);
      setError("");
    } catch (membershipError) {
      setAuthSnapshot(session?.user.id ?? null, null);
      setError(membershipError instanceof Error ? membershipError.message : "Unable to verify church membership.");
      throw membershipError;
    }
  }, [loadMembership, session]);

  const refreshSession = useCallback(async () => {
    const { data, error: sessionError } = await createClient().auth.getSession();
    if (sessionError) throw new Error(`Unable to restore the signed-in session: ${sessionError.message}`);
    await acceptSession(data.session);
  }, [acceptSession]);

  const signOut = useCallback(async () => {
    const { error: signOutError } = await createClient().auth.signOut();
    if (signOutError) throw new Error(`Unable to sign out: ${signOutError.message}`);
    await acceptSession(null);
  }, [acceptSession]);

  const value = useMemo<AuthState>(() => ({
    configured,
    loading,
    error,
    session,
    user: session?.user ?? null,
    membership,
    refreshMembership,
    refreshSession,
    signOut,
  }), [configured, error, loading, membership, refreshMembership, refreshSession, session, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw new Error("useAuth must be used within AuthProvider.");
  return state;
}
