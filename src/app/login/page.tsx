import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/app/login/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getOwnerSessionStatus, hasSupabaseAuthCookie } from "@/lib/auth";

export const instant = false;

export default async function LoginPage() {
  await connection();
  const configured = isSupabaseConfigured();
  if (configured && await hasSupabaseAuthCookie()) {
    const status = await getOwnerSessionStatus();
    if (status === "owner") redirect("/admin/songs");
    if (status === "restricted") redirect("/access-denied");
  }
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-brand" href="/"><BrandMark /> INCOC South</Link>
        <p className="eyebrow">INDIAN CHURCH OF CHRIST</p>
        <h1>Welcome back</h1>
        <p className="muted">Sign-in is restricted to the website owner.</p>
        {configured ? <LoginForm /> : (
          <div className="notice notice-warning" role="status">
            Sign-in is unavailable until Supabase is configured. Follow the setup guide in the project README.
          </div>
        )}
        <p className="auth-footnote">Songs, published Sunday schedules, and slides are available without signing in.</p>
      </section>
    </main>
  );
}
