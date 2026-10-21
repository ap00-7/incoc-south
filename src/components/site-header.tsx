import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="owner-session-label" href="/admin/songs"><ShieldCheck size={15} /> Owner</Link>
        <form action={signOut}>
          <PendingSubmitButton className="header-session-action" pendingLabel="Signing out…">Sign out</PendingSubmitButton>
        </form>
      </div>
    </header>
  );
}
