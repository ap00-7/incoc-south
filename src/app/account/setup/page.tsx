import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SetupForm } from "@/app/account/setup/setup-form";
import { getMembership } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { ThemeToggle } from "@/components/theme-toggle";

export const instant = false;

export default async function AccountSetupPage() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/login");
  const member = await getMembership();
  if (!member) redirect("/login");
  return <main className="auth-page"><section className="auth-card">
    <div className="auth-theme-toggle"><ThemeToggle /></div>
    <p className="eyebrow">ACCOUNT SETUP</p><h1>Choose a password</h1>
    <p className="muted">Set a private password for your INCOC South account.</p>
    <SetupForm />
  </section></main>;
}
