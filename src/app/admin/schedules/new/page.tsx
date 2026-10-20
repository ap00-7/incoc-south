import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewScheduleForm } from "@/components/admin/inline-schedule-manager";

export default function NewSchedulePage() {
  return <>
    <Link href="/admin/schedules" className="back-link"><ArrowLeft size={15} /> Back to schedules</Link>
    <p className="eyebrow">SCHEDULE CREATION</p><h1>Create Sunday Schedule</h1>
    <p>New schedules start as private drafts. Add items in the schedule editor after saving.</p>
    <NewScheduleForm />
  </>;
}
