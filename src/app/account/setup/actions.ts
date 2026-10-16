"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const passwordSchema = z.object({
  password: z.string().min(12, "Use at least 12 characters."),
  confirm_password: z.string(),
}).refine((value) => value.password === value.confirm_password, {
  path: ["confirm_password"],
  message: "Passwords do not match.",
});

export async function setInitialPassword(
  _previousState: string | null,
  formData: FormData,
): Promise<string | null> {
  const member = await requireMember();
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Check the password fields.";
  if (!member.user.email_confirmed_at) return "Open the invitation link from your email before setting a password.";
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return `Unable to set password: ${error.message}`;
  redirect(member.role === "owner" ? "/admin" : "/songbook");
}
