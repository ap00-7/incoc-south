"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";

type ActionResult = void | { redirectTo?: string };
type ServerFormAction = (formData: FormData) => Promise<ActionResult>;

export function useServerFormAction(action: ServerFormAction, onSuccess?: () => void) {
  const router = useRouter();
  const [error, formAction] = useActionState(async (_previousError: string | null, formData: FormData) => {
    try {
      const result = await action(formData);
      onSuccess?.();
      if (result && "redirectTo" in result && result.redirectTo) router.push(result.redirectTo);
      else router.refresh();
      return null;
    } catch (actionError) {
      return actionError instanceof Error ? actionError.message : "The operation could not be completed. Please try again.";
    }
  }, null);
  return { error, formAction };
}
