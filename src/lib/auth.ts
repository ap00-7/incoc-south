import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

export type OwnerSessionStatus = "owner" | "restricted" | "signed-out" | "unavailable";

export async function getMembership() {
  const supabase = await createClient();
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

  const { data: church, error: churchError } = await supabase
    .from("churches")
    .select("id")
    .eq("slug", "incoc-south")
    .single();
  if (churchError?.code === "PGRST116") return null;
  if (churchError) throw new Error(`Unable to load church: ${churchError.message}`);
  if (!church) return null;

  const { data: membership, error } = await supabase
    .from("church_members")
    .select("role")
    .eq("church_id", church.id)
    .eq("user_id", user.id)
    .single();
  if (error && error.code !== "PGRST116") {
    throw new Error(`Unable to verify church membership: ${error.message}`);
  }
  if (!membership) return null;
  return { user, churchId: church.id, role: membership.role };
}

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
