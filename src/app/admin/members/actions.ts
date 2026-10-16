"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function inviteMember(formData: FormData) {
  const member = await requireOwner();
  const parsed = z.object({
    email: z.string().trim().email(),
    display_name: z.string().trim().min(1).max(100),
    role: z.enum(["owner", "viewer"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Enter a valid email, display name, and role.");
  const admin = createAdminClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { display_name: parsed.data.display_name },
    redirectTo: `${origin}/auth/callback?next=/account/setup`,
  });
  if (error) throw new Error(`Unable to invite member: ${error.message}`);
  if (!data.user) throw new Error("The invitation was sent without a user record. Check Supabase Auth logs.");
  const { error: membershipError } = await admin.from("church_members").insert({
    church_id: member.churchId,
    user_id: data.user.id,
    role: parsed.data.role,
  });
  if (membershipError) {
    throw new Error(`The invitation was sent, but membership could not be assigned: ${membershipError.message}`);
  }
  revalidatePath("/admin/members");
}

export async function updateMemberRole(formData: FormData) {
  const member = await requireOwner();
  const parsed = z.object({ user_id: z.string().uuid(), role: z.enum(["owner", "viewer"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Select a valid member role.");
  if (parsed.data.user_id === member.user.id) throw new Error("You cannot change your own role.");
  const supabase = await createClient();
  const { error } = await supabase.from("church_members")
    .update({ role: parsed.data.role })
    .eq("church_id", member.churchId).eq("user_id", parsed.data.user_id);
  if (error) throw new Error(`Unable to update member role: ${error.message}`);
  revalidatePath("/admin/members");
}

export async function removeMember(formData: FormData) {
  const member = await requireOwner();
  const userId = z.string().uuid().parse(formData.get("user_id"));
  if (userId === member.user.id) throw new Error("You cannot remove your own membership.");
  const supabase = await createClient();
  const { error } = await supabase.from("church_members")
    .delete().eq("church_id", member.churchId).eq("user_id", userId);
  if (error) throw new Error(`Unable to remove member: ${error.message}`);
  revalidatePath("/admin/members");
}
