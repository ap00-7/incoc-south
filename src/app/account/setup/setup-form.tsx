"use client";

import { setInitialPassword } from "@/app/account/setup/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { useServerFormAction } from "@/components/use-server-form-action";

export function SetupForm() {
  const { error, formAction } = useServerFormAction(setInitialPassword);
  return <form className="form-stack" action={formAction}>
    <label htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
    <label htmlFor="confirm_password">Confirm password</label><input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" minLength={12} required />
    {error && <p className="form-error" role="alert">{error}</p>}
    <PendingSubmitButton className="button button-primary button-wide" pendingLabel="Saving…">Set password</PendingSubmitButton>
  </form>;
}
