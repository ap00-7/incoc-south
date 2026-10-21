import { ArrowLeft } from "lucide-react";
import { NewScheduleForm } from "@/components/admin/inline-schedule-manager";
import { IntentPrefetchLink } from "@/components/intent-prefetch-link";

export default function NewSchedulePage() {
  return <>
    <IntentPrefetchLink href="/admin/schedules" className="back-link"><ArrowLeft size={15} /> Back to schedules</IntentPrefetchLink>
    <h1 className="detail-title">Create Sunday Schedule</h1>
    <NewScheduleForm />
  </>;
}
