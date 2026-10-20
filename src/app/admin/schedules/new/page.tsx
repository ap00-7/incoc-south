import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSchedule } from "@/app/admin/actions";

export default function NewSchedulePage() {
  return <>
    <Link href="/admin/schedules" className="back-link"><ArrowLeft size={15} /> Back to schedules</Link>
    <p className="eyebrow">SERVICE PLANNING</p><h1>Plan a service</h1>
    <p>New services start as private drafts. You can publish after reviewing the programme.</p>
    <form className="form-stack admin-form" action={createSchedule} data-dirty-form>
      <label htmlFor="title">Title</label><input id="title" name="title" required maxLength={200} placeholder="e.g. Sunday worship" />
      <label htmlFor="venue">Venue <span className="muted">(optional)</span></label><input id="venue" name="venue" maxLength={200} />
      <label htmlFor="service_date">Date</label><input id="service_date" type="date" name="service_date" required />
      <fieldset>
        <legend>Schedule items</legend>
        <p className="muted">Save this schedule first. Its own item list will then be available on the Schedule page.</p>
      </fieldset>
      <label htmlFor="description">Description <span className="muted">(optional)</span></label><textarea id="description" name="description" rows={4} maxLength={2000} />
      <button className="button button-primary">Create draft</button>
    </form>
  </>;
}
