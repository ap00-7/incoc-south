import { useNavigate } from "react-router-dom";
import { useActionState } from "react";
import { notifyDataChanged } from "@/spa/data-events";

type ActionResult = void | { redirectTo?: string };
type FormAction = (formData: FormData) => Promise<ActionResult>;

export function useFormAction(action: FormAction, onSuccess?: () => void) {
  const navigate = useNavigate();
  const [error, formAction] = useActionState(async (_previousError: string | null, formData: FormData) => {
    try {
      const result = await action(formData);
      onSuccess?.();
      notifyDataChanged();
      if (result && "redirectTo" in result && result.redirectTo) navigate(result.redirectTo);
      return null;
    } catch (actionError) {
      return actionError instanceof Error ? actionError.message : "The operation could not be completed. Please try again.";
    }
  }, null);
  return { error, formAction };
}
