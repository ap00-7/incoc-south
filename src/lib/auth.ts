import { cache } from "react";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

export type OwnerSessionStatus = "owner" | "restricted" | "signed-out" | "unavailable";

export const getMembership = cache(async (
  client?: Awaited<ReturnType<typeof createClient>>,
) => {
  const supabase = client ?? await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (
    authError?.name === "AuthSessionMissingError" ||
    authError?.status === 401 ||
    authError?.code === "session_not_found"
  ) return null;
  if (authError) throw new Error("Unable to verify the signed-in account.");
  if (!user) return null;

  const { data: membership, error } = await supabase
    .from("church_members")
    .select("church_id, role, church:churches!inner(slug)")
    .eq("user_id", user.id)
    .eq("church.slug", "incoc-south")
    .maybeSingle();
  if (error) {
    throw new Error(`Unable to verify church membership: ${error.message}`);
  }
  if (!membership) return null;
  return { user, churchId: membership.church_id, role: membership.role };
});

export async function getOwnerSessionStatus(): Promise<OwnerSessionStatus> {
  if (!isSupabaseConfigured()) return "unavailable";
  try {
    const membership = await getMembership();
    if (!membership) return "signed-out";
    return membership.role === "owner" ? "owner" : "restricted";
  } catch {
    return "unavailable";
  }
}

export async function requireMember() {
  const membership = await getMembership();
  if (!membership) redirect("/login");
  return membership;
}

export async function requireOwner() {
  const membership = await requireMember();
  if (membership.role !== "owner") redirect("/access-denied");
  return membership;
}
