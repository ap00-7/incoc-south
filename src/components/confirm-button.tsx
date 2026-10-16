"use client";

import type { FormEvent, ReactNode } from "react";

export function ConfirmButton({
  action,
  message,
  children,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  children: ReactNode;
  className?: string;
}) {
  function confirm(event: FormEvent<HTMLButtonElement>) {
    if (!window.confirm(message)) event.preventDefault();
  }
  return <button type="submit" formAction={action} className={className} onClick={confirm}>{children}</button>;
}
