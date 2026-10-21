import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, CalendarDays, Plus } from "lucide-react";
import { connection } from "next/server";
import { PageContentLoading, PageShell, SectionHeading } from "@/components/page-shell";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { hasSupabaseAuthCookie, getMembership } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getPublicChurchContext } from "@/lib/supabase/public-content";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "long",
  timeZone: "Asia/Kolkata",
});

type Props = { searchParams: Promise<{ page?: string }> };
const PAGE_SIZE = 50;

export default function SchedulePage({ searchParams }: Props) {
  return (
    <PageShell>
      <Suspense fallback={<PageContentLoading title="Gather together" />}>
        <ScheduleContent searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function ScheduleContent({ searchParams }: Props) {
  await connection();
  if (!isSupabaseConfigured()) {
    return <div className="content-wrap"><SectionHeading title="Sunday Schedule" /><div className="notice notice-warning">Published service schedules will appear here after Supabase is configured.</div></div>;
  }
  const params = await searchParams;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), 10_000) : 1;
  const { supabase, churchId } = await getPublicChurchContext();
  const membership = await hasSupabaseAuthCookie() ? await getMembership(supabase) : null;
  const isOwner = membership?.role === "owner";
  let schedulesQuery = supabase.from("schedules")
    .select("id, title, service_date, venue, description, status, updated_at", {
      count: isOwner ? undefined : "exact",
    })
    .eq("church_id", churchId);
  if (!isOwner) schedulesQuery = schedulesQuery.eq("status", "published");
  const { data: schedules, error, count } = await schedulesQuery
    .order("service_date", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (error) throw new Error(`Unable to load services: ${error.message}`);
  const schedulesForPage = schedules ?? [];
  if (!isOwner && count === 1 && schedulesForPage[0]) {
    redirect(`/schedule/${schedulesForPage[0].id}`);
  }
  const hasNextPage = schedulesForPage.length > PAGE_SIZE;
  const visibleSchedules = schedulesForPage.slice(0, PAGE_SIZE);
  return (
    <>
      <RealtimeRefresh subscriptions={[
        { table: "schedules", column: "church_id", value: churchId },
      ]} />
      <div className="content-wrap">
        <div className="schedule-list-heading">
          <SectionHeading title="Sunday Schedule" />
          {isOwner && <Link href="/admin/schedules/new" className="button button-primary"><Plus size={15} /> Create schedule</Link>}
        </div>
        {visibleSchedules.length ? <div className="results-list">
          {visibleSchedules.map((schedule) => <article className="public-list-entry" key={schedule.id}>
            <Link className="result-card" href={`/schedule/${schedule.id}`}>
              <div><h2>{schedule.title}</h2><p>{schedule.venue ?? "Venue not set"}</p><p><CalendarDays size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />{dateFormatter.format(new Date(`${schedule.service_date}T12:00:00+05:30`))}</p></div>
              <span className="public-entry-meta">{schedule.status === "draft" ? "Draft" : ""}<ArrowRight size={17} aria-hidden="true" /></span>
            </Link>
            {isOwner && <Link className="schedule-edit-link" href={`/admin/schedules/${schedule.id}`}>Edit schedule</Link>}
          </article>)}
        </div> : <div className="empty-state">There are no {isOwner ? "services" : "published services"} to show yet.</div>}
        {(page > 1 || hasNextPage) && <nav className="list-pagination" aria-label="Sunday Schedule pages">
          {page > 1 && <Link className="button button-secondary" href={`/schedule?page=${page - 1}`}>Newer services</Link>}
          {hasNextPage && <Link className="button button-secondary" href={`/schedule?page=${page + 1}`}>Older services</Link>}
        </nav>}
      </div>
    </>
  );
}
