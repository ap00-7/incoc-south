"use client";

import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { ConfirmationDialog } from "@/components/confirm-button";

export function UnsavedChangesGuard() {
  const navigate = useNavigate();
  const dirtyForms = useRef(new Set<HTMLFormElement>());
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    function markDirty(event: Event) {
      const form = event.target instanceof Element ? event.target.closest("form[data-dirty-form]") : null;
      if (form instanceof HTMLFormElement) dirtyForms.current.add(form);
    }

    function clearOnSubmit(event: Event) {
      if (event.target instanceof HTMLFormElement) dirtyForms.current.delete(event.target);
    }

    function confirmNavigation(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!target || dirtyForms.current.size === 0) return;
      const link = target as HTMLAnchorElement;
      if (new URL(link.href).href === window.location.href) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setPendingHref(link.href);
    }

    document.addEventListener("input", markDirty, true);
    document.addEventListener("change", markDirty, true);
    document.addEventListener("submit", clearOnSubmit, true);
    document.addEventListener("click", confirmNavigation, true);
    return () => {
      document.removeEventListener("input", markDirty, true);
      document.removeEventListener("change", markDirty, true);
      document.removeEventListener("submit", clearOnSubmit, true);
      document.removeEventListener("click", confirmNavigation, true);
    };
  }, [navigate]);

  return pendingHref ? <ConfirmationDialog
    title="Discard unsaved changes?"
    description="Your changes have not been saved. Leave this page and discard them?"
    confirmLabel="Discard changes"
    pendingLabel="Leaving…"
    confirmClassName="button button-danger"
    onConfirm={() => {
      dirtyForms.current.clear();
      const destination = new URL(pendingHref);
      setPendingHref(null);
      if (destination.origin === window.location.origin) navigate(`${destination.pathname}${destination.search}${destination.hash}`);
      else window.location.assign(pendingHref);
    }}
    onCancel={() => setPendingHref(null)}
  /> : null;
}
