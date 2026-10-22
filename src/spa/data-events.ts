import { applyScheduleDeletion, clearResourceCache } from "@/spa/use-async-resource";

let refreshScheduled = false;

export function notifyDataChanged(path?: string) {
  if (refreshScheduled) return;
  refreshScheduled = true;
  queueMicrotask(() => {
    refreshScheduled = false;
    clearResourceCache();
    window.dispatchEvent(new CustomEvent("incoc:data-changed", { detail: path }));
  });
}

export function notifyScheduleDeleted(scheduleId: string) {
  return applyScheduleDeletion(scheduleId);
}
