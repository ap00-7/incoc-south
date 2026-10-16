import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getMembership() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return null;

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
  return { user, churchId: church.id, role: membership.role as "owner" | "viewer" };
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
