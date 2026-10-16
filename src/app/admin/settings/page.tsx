import { isSupabaseConfigured } from "@/lib/supabase/server";
import { connection } from "next/server";

export default async function AdminSettingsPage() {
  await connection();
  return <>
    <p className="eyebrow">APPLICATION</p><h1>Settings</h1>
    <p>INCOC South is configured for Indian Church of Christ, South Sector.</p>
    <dl className="settings-list">
      <div><dt>Application</dt><dd>INCOC South (<code>incoc-south</code>)</dd></div>
      <div><dt>Organization</dt><dd>Indian Church of Christ</dd></div>
      <div><dt>Ministry</dt><dd>South Sector</dd></div>
      <div><dt>Church timezone</dt><dd>Asia/Kolkata</dd></div>
      <div><dt>Supabase</dt><dd>{isSupabaseConfigured() ? "Configured" : "Not configured"}</dd></div>
      <div><dt>Presentation links</dt><dd>Disabled. Synchronized presentations require signed-in church members.</dd></div>
    </dl>
    <div className="notice">Database credentials and deployment variables are managed outside the browser in the project environment.</div>
  </>;
}
