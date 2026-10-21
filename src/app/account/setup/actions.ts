import { z } from "zod";
import { createClient } from "@/lib/supabase/browser";

const passwordSchema = z.object({
  password: z.string().min(12, "Use at least 12 characters."),
  confirm_password: z.string(),
}).refine((value) => value.password === value.confirm_password, {
  path: ["confirm_password"],
  message: "Passwords do not match.",
});

export async function setInitialPassword(formData: FormData) {
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the password fields.");
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sign in through your invitation link before setting a password.");
  if (!userData.user.email_confirmed_at) throw new Error("Open the invitation link from your email before setting a password.");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) throw new Error(`Unable to set password: ${error.message}`);
  return { redirectTo: "/song" };
}
