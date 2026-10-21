import { signIn } from "@/lib/actions/auth";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { useFormAction } from "@/components/use-form-action";

export function LoginForm() {
  const { error, formAction } = useFormAction(signIn);
  return (
    <form className="form-stack" action={formAction}>
      <label htmlFor="email">Email address</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      {error && <p className="form-error" role="alert">{error}</p>}
      <PendingSubmitButton className="button button-primary button-wide" pendingLabel="Signing in…">Sign in</PendingSubmitButton>
    </form>
  );
}
