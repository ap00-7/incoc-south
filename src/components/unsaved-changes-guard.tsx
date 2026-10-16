"use client";

import { useEffect, useRef } from "react";

export function UnsavedChangesGuard() {
  const dirtyForms = useRef(new Set<HTMLFormElement>());

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
      if (!window.confirm("You have unsaved changes. Leave this page and discard them?")) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      } else {
        dirtyForms.current.clear();
      }
    }

    function confirmClose(event: BeforeUnloadEvent) {
      if (dirtyForms.current.size === 0) return;
      event.preventDefault();
      event.returnValue = "";
    }

    document.addEventListener("input", markDirty, true);
    document.addEventListener("change", markDirty, true);
    document.addEventListener("submit", clearOnSubmit, true);
    document.addEventListener("click", confirmNavigation, true);
    window.addEventListener("beforeunload", confirmClose);
    return () => {
      document.removeEventListener("input", markDirty, true);
      document.removeEventListener("change", markDirty, true);
      document.removeEventListener("submit", clearOnSubmit, true);
      document.removeEventListener("click", confirmNavigation, true);
      window.removeEventListener("beforeunload", confirmClose);
    };
  }, []);

  return null;
}
