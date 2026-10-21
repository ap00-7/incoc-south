import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function PendingSubmitButton({
  children,
  pendingLabel = "Saving…",
  className = "button button-primary",
  disabled = false,
  ariaLabel,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending} aria-label={pending ? pendingLabel : ariaLabel}>
      {pending && <LoaderCircle size={15} className="button-spinner" aria-hidden="true" />}
      {pending ? pendingLabel : children}
    </button>
  );
}
