"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function signIn(
  _previousState: string | null,
  formData: FormData,
): Promise<string | null> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return "Enter a valid email and password.";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return "Sign-in failed. Check your email and password.";

  const membership = await getMembership();
  redirect(membership ? (membership.role === "owner" ? "/admin" : "/songbook") : "/access-denied");
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Unable to sign out: ${error.message}`);
  redirect("/");
}
