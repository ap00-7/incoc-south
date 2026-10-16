import Link from "next/link";
import { connection } from "next/server";
import { Church } from "lucide-react";
import { LoginForm } from "@/app/login/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const instant = false;

export default async function LoginPage() {
  await connection();
  const configured = isSupabaseConfigured();
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-brand" href="/"><span className="brand-mark"><Church size={21} /></span> INCOC South</Link>
        <p className="eyebrow">INDIAN CHURCH OF CHRIST</p>
        <h1>Welcome back</h1>
        <p className="muted">Sign in with your authorized church account.</p>
        {configured ? <LoginForm /> : (
          <div className="notice notice-warning" role="status">
            Sign-in is unavailable until Supabase is configured. Follow the setup guide in the project README.
          </div>
        )}
        <p className="auth-footnote">Access is limited to members provisioned by a church owner.</p>
      </section>
    </main>
  );
}
