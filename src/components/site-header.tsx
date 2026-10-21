import { ShieldCheck } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { IntentPrefetchLink } from "@/components/intent-prefetch-link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <IntentPrefetchLink className="owner-session-label" href="/admin/songs"><ShieldCheck size={15} /> Owner</IntentPrefetchLink>
        <form action={signOut}>
          <PendingSubmitButton className="header-session-action" pendingLabel="Signing out…">Sign out</PendingSubmitButton>
        </form>
      </div>
    </header>
  );
}
