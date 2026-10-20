"use client";

import { useActionState } from "react";
import { signIn } from "@/app/actions/auth";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export function LoginForm() {
  const [error, action] = useActionState(signIn, null);
  return (
    <form className="form-stack" action={action}>
      <label htmlFor="email">Email address</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      {error && <p className="form-error" role="alert">{error}</p>}
      <PendingSubmitButton className="button button-primary button-wide" pendingLabel="Signing in…">Sign in</PendingSubmitButton>
    </form>
  );
}
