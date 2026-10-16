"use client";

import { useActionState } from "react";
import { setInitialPassword } from "@/app/account/setup/actions";

export function SetupForm() {
  const [error, action, pending] = useActionState(setInitialPassword, null);
  return <form className="form-stack" action={action}>
    <label htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
    <label htmlFor="confirm_password">Confirm password</label><input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" minLength={12} required />
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button-primary button-wide" disabled={pending}>{pending ? "Saving…" : "Set password"}</button>
  </form>;
}
