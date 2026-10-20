"use client";

import { useActionState } from "react";
import { setInitialPassword } from "@/app/account/setup/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export function SetupForm() {
  const [error, action] = useActionState(setInitialPassword, null);
  return <form className="form-stack" action={action}>
    <label htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
    <label htmlFor="confirm_password">Confirm password</label><input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" minLength={12} required />
    {error && <p className="form-error" role="alert">{error}</p>}
    <PendingSubmitButton className="button button-primary button-wide" pendingLabel="Saving…">Set password</PendingSubmitButton>
  </form>;
}
