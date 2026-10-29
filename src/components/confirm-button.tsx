import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { notifyDataChanged } from "@/spa/data-events";

type ServerAction = (formData: FormData) => void | { redirectTo?: string } | Promise<void | { redirectTo?: string }>;

export function ConfirmationDialog({
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  pendingLabel = "Deleting…",
  confirmClassName = "button button-danger",
  pending = false,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pendingLabel?: string;
  confirmClassName?: string;
  pending?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLButtonElement>("[data-dialog-cancel]")?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onCancel();
      if (event.key !== "Tab") return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel, pending]);

  return (
    <div className="confirm-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !pending) onCancel();
    }}>
      <section ref={dialogRef} className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description" tabIndex={-1}>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-description">{description}</p>
        {error && <p className="confirm-dialog-error" role="alert">{error}</p>}
        <div className="confirm-dialog-actions">
          <button type="button" className="button button-secondary" data-dialog-cancel onClick={onCancel} disabled={pending}>{cancelLabel}</button>
          <button type="button" className={confirmClassName} onClick={onConfirm} disabled={pending} aria-busy={pending}>
            {pending && <LoaderCircle size={15} className="button-spinner" aria-hidden="true" />}
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function ConfirmButton({
  action,
  message,
  children,
  className,
  pendingLabel = "Deleting…",
  confirmClassName,
  title = "Delete item?",
  confirmLabel = "Delete",
  onActionSuccess,
  role,
}: {
  action: ServerAction;
  message: string;
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
  confirmClassName?: string;
  title?: string;
  confirmLabel?: string;
  onActionSuccess?: () => void;
  role?: "menuitem";
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);

  function closeDialog() {
    if (pending) return;
    setOpen(false);
    setError("");
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function confirm() {
    const form = triggerRef.current?.closest("form");
    if (!form || pending) return;
    const formData = new FormData(form);
    setError("");
    startTransition(async () => {
      try {
        const result = await action(formData);
        onActionSuccess?.();
        notifyDataChanged();
        setOpen(false);
        if (result && "redirectTo" in result && result.redirectTo) navigate(result.redirectTo);
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "The action could not be completed. Please try again.");
      }
    });
  }

  return (
    <>
      <button ref={triggerRef} type="button" className={className} role={role} onClick={() => { setOpen(true); setError(""); }} aria-haspopup="dialog">
        {pending ? pendingLabel : children}
      </button>
      {open && <ConfirmationDialog
        title={title}
        description={message}
        confirmLabel={confirmLabel}
        pendingLabel={pendingLabel}
        confirmClassName={confirmClassName}
        pending={pending}
        error={error}
        onCancel={closeDialog}
        onConfirm={confirm}
      />}
    </>
  );
}
