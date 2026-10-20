import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { signOut } from "@/app/actions/auth";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="owner-session-label" href="/admin/songs"><ShieldCheck size={15} /> Owner</Link>
        <form action={signOut}>
          <button type="submit" className="header-session-action">Sign out</button>
        </form>
      </div>
    </header>
  );
}
