"use client";

import type { FormEvent, ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function ConfirmButton({
  action,
  message,
  children,
  className,
  pendingLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  function confirm(event: FormEvent<HTMLButtonElement>) {
    if (pending || !window.confirm(message)) event.preventDefault();
  }
  return (
    <button type="submit" formAction={action} className={className} onClick={confirm} disabled={pending} aria-busy={pending}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
