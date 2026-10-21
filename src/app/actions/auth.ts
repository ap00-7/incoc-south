import { z } from "zod";
import { createClient } from "@/lib/supabase/browser";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function signIn(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) throw new Error("Enter a valid email and password.");

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) throw new Error("Sign-in failed. Check your email and password.");
}

export async function signOut() {
  const { error } = await createClient().auth.signOut();
  if (error) throw new Error(`Unable to sign out: ${error.message}`);
}
