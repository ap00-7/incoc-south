import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewScheduleForm } from "@/components/admin/inline-schedule-manager";

export default function NewSchedulePage() {
  return <>
    <Link href="/admin/schedules" className="back-link"><ArrowLeft size={15} /> Back to schedules</Link>
    <h1 className="detail-title">Create Sunday Schedule</h1>
    <NewScheduleForm />
  </>;
}
