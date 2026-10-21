import { z } from "zod";
import { requireOwner } from "@/lib/auth-client";
import { createClient } from "@/lib/supabase/browser";

const memberInputSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["owner", "viewer"]),
});

export async function inviteMember(formData: FormData) {
  const parsed = z.object({
    email: z.string().trim().email(),
    display_name: z.string().trim().min(1).max(100),
    role: z.enum(["owner", "viewer"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Enter a valid email, display name, and role.");
  const { data, error } = await createClient().auth.getSession();
  if (error) throw new Error(`Unable to verify the signed-in session: ${error.message}`);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Sign in as an owner before inviting members.");

  let response: Response;
  try {
    response = await fetch("/api/invite", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parsed.data),
    });
  } catch {
    throw new Error("Unable to reach the invitation service. Check your connection and try again.");
  }
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
      ? result.error
      : "Unable to send the invitation.";
    throw new Error(message);
  }
}

export async function updateMemberRole(formData: FormData) {
  const owner = await requireOwner();
  const parsed = memberInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Select a valid member role.");
  if (parsed.data.user_id === owner.user.id) throw new Error("You cannot change your own role.");
  const { data, error } = await createClient().from("church_members")
    .update({ role: parsed.data.role })
    .eq("church_id", owner.churchId).eq("user_id", parsed.data.user_id)
    .select("user_id").maybeSingle();
  if (error) throw new Error(`Unable to update member role: ${error.message}`);
  if (!data) throw new Error("This membership could not be updated. Refresh the page and try again.");
}

export async function removeMember(formData: FormData) {
  const owner = await requireOwner();
  const parsed = z.string().uuid().safeParse(formData.get("user_id"));
  if (!parsed.success) throw new Error("Select a valid member.");
  if (parsed.data === owner.user.id) throw new Error("You cannot remove your own membership.");
  const { data, error } = await createClient().from("church_members").delete()
    .eq("church_id", owner.churchId).eq("user_id", parsed.data)
    .select("user_id").maybeSingle();
  if (error) throw new Error(`Unable to remove member: ${error.message}`);
  if (!data) throw new Error("This membership could not be removed. Refresh the page and try again.");
}
