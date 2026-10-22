import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, MonitorPlay, Plus, Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { IntentPrefetchLink } from "@/components/intent-prefetch-link";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { CachedSongLink } from "@/components/cached-song-link";
import { SongCacheSeed } from "@/components/song-cache-seed";
import { SongbookSearch } from "@/components/songbook-search";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { BrandMark } from "@/components/brand-mark";
import { deleteSong } from "@/lib/actions/content";
import { removeMember } from "@/lib/actions/members";
import { createClient } from "@/lib/supabase/browser";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { filterPresentationItems, generateSlides, groupPresentationSlides, normalizeProgrammeItems } from "@/lib/domain/slides";
import { useAuth } from "@/spa/auth-provider";
import { useAsyncResource } from "@/spa/use-async-resource";

const PAGE_SIZE = 50;
const EMPTY_LIST: never[] = [];
const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" });
const SongPageContent = lazy(() => import("@/components/song-page-content").then((module) => ({ default: module.SongPageContent })));
const Presentation = lazy(() => import("@/components/presentation").then((module) => ({ default: module.Presentation })));
const SongEditorForm = lazy(() => import("@/components/admin/song-creation-form").then((module) => ({ default: module.SongEditorForm })));
const InlineScheduleDetails = lazy(() => import("@/components/admin/inline-schedule-manager").then((module) => ({ default: module.InlineScheduleDetails })));
const InlineScheduleManager = lazy(() => import("@/components/admin/inline-schedule-manager").then((module) => ({ default: module.InlineScheduleManager })));
const NewScheduleForm = lazy(() => import("@/components/admin/inline-schedule-manager").then((module) => ({ default: module.NewScheduleForm })));
const ScheduleActions = lazy(() => import("@/components/admin/inline-schedule-manager").then((module) => ({ default: module.ScheduleActions })));
const InviteMemberForm = lazy(() => import("@/components/admin/member-action-forms").then((module) => ({ default: module.InviteMemberForm })));
const MemberRoleForm = lazy(() => import("@/components/admin/member-action-forms").then((module) => ({ default: module.MemberRoleForm })));
const LoginForm = lazy(() => import("@/components/auth/login-form").then((module) => ({ default: module.LoginForm })));
const SetupForm = lazy(() => import("@/components/auth/setup-form").then((module) => ({ default: module.SetupForm })));

const routeScrollPositions = new Map<string, { x: number; y: number }>();
let songbookScrollPosition = 0;

function ScrollPositionRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  useLayoutEffect(() => {
    const scrollContainer = document.querySelector<HTMLElement>(".page-main");
    const readPosition = () => scrollContainer
      ? { x: scrollContainer.scrollLeft, y: scrollContainer.scrollTop }
      : { x: window.scrollX, y: window.scrollY };
    const scrollTo = (x: number, y: number) => {
      if (scrollContainer) scrollContainer.scrollTo(x, y);
      else window.scrollTo(x, y);
    };
    let observer: ResizeObserver | undefined;
    let mutationObserver: MutationObserver | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let restored = false;
    const savedPosition = navigationType === "POP"
      ? routeScrollPositions.get(location.key)
      : location.pathname === "/song" && (location.state as { restoreSongbook?: boolean } | null)?.restoreSongbook
        ? { x: 0, y: songbookScrollPosition }
        : undefined;
    const restore = () => {
      if (restored) return;
      restored = true;
      if (frame) cancelAnimationFrame(frame);
      if (timeout) clearTimeout(timeout);
      observer?.disconnect();
      mutationObserver?.disconnect();
      scrollTo(savedPosition?.x ?? 0, savedPosition?.y ?? 0);
    };

    if (!savedPosition || savedPosition.y === 0) {
      restore();
    } else {
      const tryRestore = () => {
        const contentHeight = scrollContainer?.scrollHeight ?? document.documentElement.scrollHeight;
        const viewportHeight = scrollContainer?.clientHeight ?? window.innerHeight;
        if (contentHeight >= savedPosition.y + viewportHeight) restore();
      };
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(tryRestore);
      });
      observer = new ResizeObserver(tryRestore);
      if (scrollContainer) {
        observer.observe(scrollContainer);
        for (const child of scrollContainer.children) {
          if (child instanceof Element) observer.observe(child);
        }
        mutationObserver = new MutationObserver(() => {
          for (const child of scrollContainer.children) {
            if (child instanceof Element) observer?.observe(child);
          }
          tryRestore();
        });
        mutationObserver.observe(scrollContainer, { childList: true });
      } else {
        observer.observe(document.documentElement);
        observer.observe(document.body);
      }
      timeout = setTimeout(restore, 1200);
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (timeout) clearTimeout(timeout);
      observer?.disconnect();
      mutationObserver?.disconnect();
      const position = readPosition();
      routeScrollPositions.set(location.key, position);
      if (location.pathname === "/song") songbookScrollPosition = position.y;
    };
  }, [location.key, location.pathname, location.state, navigationType]);
  return null;
}

function PageShell({ children, owner = false }: { children: ReactNode; owner?: boolean }) {
  const { pathname } = useLocation();
  const showHeader = pathname === "/";
  return <>
    {showHeader && <SiteHeader owner={owner} showNavigation />}
    <main className={`page-main${showHeader ? "" : " page-main-headerless"}`}>{children}</main>
    <SiteFooter />
  </>;
}

function LoadingPage({ title }: { title: string }) {
  return <div className="content-wrap route-loading-shell" role="status" aria-busy="true">
    <p className="eyebrow">INCOC SOUTH</p>
    <h1 className="detail-title">{title}</h1>
    <span className="loading-line loading-line-wide" />
    <span className="loading-line" />
    <span className="loading-line loading-line-short" />
    <span className="sr-only">Loading content…</span>
  </div>;
}

function InlineLoading({ children = "Loading content…" }: { children?: ReactNode }) {
  return <p className="muted" role="status" aria-busy="true">{children}</p>;
}

function safeReturnTo(candidate: string | null) {
  if (!candidate?.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return "/song";
  const target = new URL(candidate, window.location.origin);
  if (target.origin !== window.location.origin || ["/login", "/auth/callback"].includes(target.pathname)) return "/song";
  return `${target.pathname}${target.search}${target.hash}`;
}

function ResourceMessage({ error, retry, children }: { error: string; retry?: () => void; children?: React.ReactNode }) {
  return <div className="content-wrap">
    <div className="notice notice-warning" role="alert">
      {error}
      {retry && <> <button type="button" className="text-link" onClick={retry}>Try again</button></>}
      {children}
    </div>
  </div>;
}

function HomePage() {
  const features = [
    { icon: BookOpen, title: "Worship Songbook", text: "Browse worship songs, lyrics, and available translations." },
    { icon: CalendarDays, title: "Sunday Schedule", text: "Organize Sunday service schedules and programme details." },
    { icon: MonitorPlay, title: "Presentation Slides", text: "Present song lyrics and service content during worship." },
  ];
  return <PageShell>
    <div className="content-wrap about-page">
      <section className="about-intro" aria-labelledby="about-title">
        <p className="eyebrow">INDIAN CHURCH OF CHRIST · SOUTH SECTOR</p>
        <h1 className="detail-title" id="about-title">About INCOC South</h1>
        <p className="about-lead">INCOC South is a digital platform for the Indian Church of Christ – South Sector, bringing worship songs and lyrics, Sunday service schedules, and presentation content together to support service preparation.</p>
      </section>
      <section className="about-features" aria-labelledby="about-features-title">
        <div className="section-intro">
          <p className="eyebrow">CORE FEATURES</p>
          <h2 id="about-features-title">Resources for Sunday worship</h2>
        </div>
        <div className="experience-grid">
          {features.map(({ icon: Icon, title, text }) => <article className="experience-card about-feature-card" key={title}>
            <span className="experience-icon"><Icon size={19} aria-hidden="true" /></span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>)}
        </div>
      </section>
      <p className="about-closing">INCOC South supports organized worship and Sunday service preparation.</p>
    </div>
  </PageShell>;
}

function SongbookPage() {
  const { membership } = useAuth();
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  const language = searchParams.get("language")?.trim() ?? "";
  const pageValue = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(pageValue) ? Math.min(Math.max(pageValue, 1), 10_000) : 1;
  const loadSongs = useCallback(async () => {
    const supabase = createClient();
    let request = supabase.from("songs")
      .select("id, title, language, author, updated_at, church:churches!inner(id, slug)")
      .eq("church.slug", "incoc-south").order("title").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    if (query) request = request.ilike("title", `%${query}%`);
    if (language) request = request.eq("language", language);
    const [{ data: songs, error }, { data: church, error: churchError }] = await Promise.all([
      request,
      supabase.from("churches").select("id").eq("slug", "incoc-south").maybeSingle(),
    ]);
    if (error) throw new Error(`Unable to load the Songbook: ${error.message}`);
    if (churchError) throw new Error(`Unable to find the Songbook: ${churchError.message}`);
    return { songs: songs ?? [], churchId: church?.id ?? "" };
  }, [language, page, query]);
  const resource = useAsyncResource(`songbook:${query}:${language}:${page}`, loadSongs);
  const songs = resource.data?.songs ?? [];
  const hasNextPage = songs.length > PAGE_SIZE;
  const visibleSongs = songs.slice(0, PAGE_SIZE);
  const filters = new URLSearchParams();
  if (query) filters.set("q", query);
  if (language) filters.set("language", language);
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams(filters);
    params.set("page", String(targetPage));
    return `/song?${params.toString()}`;
  };

  return <PageShell owner={membership?.role === "owner"}>
    {resource.error && !resource.data ? <ResourceMessage error={resource.error} retry={resource.refresh} />
      : <>
        {resource.error && <ResourceMessage error={`The latest Songbook refresh failed: ${resource.error}`} retry={resource.refresh} />}
        {resource.data?.churchId && <SongCacheSeed songs={visibleSongs} churchId={resource.data.churchId} />}
        <div className="content-wrap">
          <div className="section-heading"><h1>Songbook</h1></div>
          {resource.loading && resource.data && <InlineLoading>Checking for Songbook updates…</InlineLoading>}
          {resource.loading && !resource.data ? <InlineLoading>Loading songs…</InlineLoading> : <>
            {membership?.role === "owner" && <details className="inline-owner-editor" open={searchParams.get("create") === "1"}>
              <summary>Add a song</summary><Suspense fallback={<InlineLoading>Loading song editor…</InlineLoading>}><SongEditorForm returnTo="/song" /></Suspense>
            </details>}
            <SongbookSearch key={`${query}|${language}`} songs={visibleSongs} query={query} language={language} />
            {visibleSongs.length ? <div className="results-list songbook-results-list">
              {visibleSongs.map((song) => <CachedSongLink className="song-title-result" key={song.id} songId={song.id} updatedAt={song.updated_at}>{song.title}</CachedSongLink>)}
            </div> : <div className="empty-state">{query || language ? "No songs match those filters." : "The songbook is ready for its first song."}</div>}
            {(page > 1 || hasNextPage) && <nav className="list-pagination" aria-label="Songbook pages">
              {page > 1 && <Link className="button button-secondary" to={pageHref(page - 1)}>Previous songs</Link>}
              {hasNextPage && <Link className="button button-secondary" to={pageHref(page + 1)}>More songs</Link>}
            </nav>}
          </>}
        </div>
      </>}
  </PageShell>;
}

function SongDetailPage() {
  const { songId = "" } = useParams();
  const { membership } = useAuth();
  const [searchParams] = useSearchParams();
  return <PageShell owner={membership?.role === "owner"}>
    <Suspense fallback={<div className="content-wrap"><InlineLoading>Loading song…</InlineLoading></div>}>
      <SongPageContent songId={songId} isOwner={membership?.role === "owner"} editOpen={searchParams.get("edit") === "1"} />
    </Suspense>
  </PageShell>;
}

async function loadPublishedSchedules(page: number) {
  const { data, error, count } = await createClient().from("schedules")
    .select("id, title, service_date, venue, description, updated_at, church:churches!inner(id, slug)", { count: "exact" })
    .eq("church.slug", "incoc-south").eq("status", "published")
    .order("service_date", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (error) throw new Error(`Unable to load services: ${error.message}`);
  return { schedules: data ?? [], count: count ?? 0 };
}

function ScheduleListPage() {
  const { membership } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pageValue = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(pageValue) ? Math.min(Math.max(pageValue, 1), 10_000) : 1;
  const loadSchedules = useCallback(() => loadPublishedSchedules(page), [page]);
  const resource = useAsyncResource(`schedules:${page}`, loadSchedules);
  const schedules = resource.data?.schedules ?? EMPTY_LIST;
  const isOwner = membership?.role === "owner";
  useEffect(() => {
    if (!isOwner && resource.data?.count === 1 && schedules[0]) navigate(`/schedule/${schedules[0].id}`, { replace: true });
  }, [isOwner, navigate, resource.data?.count, schedules]);
  const churchId = schedules[0]?.church.id ?? membership?.churchId;
  const hasNextPage = schedules.length > PAGE_SIZE;
  return <PageShell owner={isOwner}>
    {resource.error && !resource.data ? <ResourceMessage error={resource.error} retry={resource.refresh} />
      : <>
        {resource.error && <ResourceMessage error={`The latest schedule refresh failed: ${resource.error}`} retry={resource.refresh} />}
        {churchId && <RealtimeRefresh subscriptions={[{ table: "schedules", column: "church_id", value: churchId }]} />}
        <div className="content-wrap">
          {resource.loading && resource.data && <InlineLoading>Checking for schedule updates…</InlineLoading>}
          <div className="schedule-list-heading">
            <div className="section-heading"><h1>Sunday Schedule</h1></div>
            {isOwner && <Link to="/admin/schedules/new" className="button button-primary"><Plus size={15} /> Create schedule</Link>}
          </div>
          {resource.loading && !resource.data ? <InlineLoading>Loading services…</InlineLoading> : schedules.length ? <div className="results-list">
            {schedules.slice(0, PAGE_SIZE).map((schedule) => <article className="public-list-entry" key={schedule.id}>
              <IntentPrefetchLink className="result-card" href={`/schedule/${schedule.id}`}>
                <div><h2>{schedule.title}</h2><p>{schedule.venue ?? "Venue not set"}</p><p><CalendarDays size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />{dateFormatter.format(new Date(`${schedule.service_date}T12:00:00+05:30`))}</p></div>
                <span className="public-entry-meta"><ArrowRight size={17} aria-hidden="true" /></span>
              </IntentPrefetchLink>
              {isOwner && <IntentPrefetchLink className="schedule-edit-link" href={`/admin/schedules/${schedule.id}`}>Edit schedule</IntentPrefetchLink>}
            </article>)}
          </div> : <div className="empty-state">There are no services to show yet.</div>}
          {(page > 1 || hasNextPage) && <nav className="list-pagination" aria-label="Sunday Schedule pages">
            {page > 1 && <Link className="button button-secondary" to={`/schedule?page=${page - 1}`}>Newer services</Link>}
            {hasNextPage && <Link className="button button-secondary" to={`/schedule?page=${page + 1}`}>Older services</Link>}
          </nav>}
        </div>
      </>}
  </PageShell>;
}

function ScheduleDetailPage() {
  const { scheduleId = "" } = useParams();
  const { membership } = useAuth();
  const isOwner = membership?.role === "owner";
  const navigate = useNavigate();
  const loadSchedule = useCallback(async () => {
    const baseQuery = createClient().from("schedules")
      .select("id, title, service_date, venue, description, schedule_items(id, item_type, title, position, leader_name, translator_name, translation_language, duration_minutes, public_content, link_title, link_url, media_url, background_image_url, song_id, song:songs(id, title, updated_at)), church:churches!inner(id, slug)")
      .eq("id", scheduleId).eq("church.slug", "incoc-south");
    const serviceQuery = isOwner ? baseQuery : baseQuery.eq("status", "published");
    const { data, error } = await serviceQuery.maybeSingle();
    if (error) throw new Error(`Unable to load service: ${error.message}`);
    if (!data) throw new Error("This service is not available.");
    return { ...data, schedule_items: [...(data.schedule_items ?? [])].sort((a, b) => a.position - b.position) };
  }, [isOwner, scheduleId]);
  const resource = useAsyncResource(`schedule:${scheduleId}:${isOwner ? "owner" : "viewer"}`, loadSchedule);
  const loadPublishedServices = useCallback(() => loadPublishedSchedules(1), []);
  const publishedServices = useAsyncResource("schedules:1", loadPublishedServices);
  const schedule = resource.data;
  return <PageShell owner={isOwner}>
    {resource.error && !schedule ? <ResourceMessage error={resource.error} retry={resource.refresh} /> : !schedule
      ? <article className="content-wrap">
        {publishedServices.data?.count > 1 && <IntentPrefetchLink href="/schedule" className="back-link"><ArrowLeft size={15} /> Back to services</IntentPrefetchLink>}
        <h1 className="detail-title">Sunday Schedule</h1><InlineLoading>Loading service…</InlineLoading>
      </article>
      : <>
        {resource.error && <ResourceMessage error={`The latest service refresh failed: ${resource.error}`} retry={resource.refresh} />}
        {publishedServices.error && <ResourceMessage error={`Unable to check available services: ${publishedServices.error}`} retry={publishedServices.refresh} />}
        {resource.loading && resource.data && <div className="content-wrap"><InlineLoading>Checking for service updates…</InlineLoading></div>}
        <RealtimeRefresh subscriptions={[
          { table: "schedules", column: "church_id", value: schedule.church.id },
          { table: "schedule_items", column: "schedule_id", value: schedule.id },
          ...schedule.schedule_items.flatMap((item) => item.song_id ? [
            { table: "songs" as const, column: "id", value: item.song_id },
            { table: "song_sections" as const, column: "song_id", value: item.song_id },
          ] : []),
        ]} onDelete={(deletedId) => {
          if (deletedId === schedule.id) navigate("/schedule", { replace: true });
        }} />
        <article className="content-wrap">
          {publishedServices.data?.count > 1 && <IntentPrefetchLink href="/schedule" className="back-link"><ArrowLeft size={15} /> Back to services</IntentPrefetchLink>}
          <header className={`schedule-detail-heading${isOwner ? " has-edit" : ""}`}>
            {isOwner && <IntentPrefetchLink href={`/admin/schedules/${schedule.id}`} className="schedule-edit-link">Edit schedule</IntentPrefetchLink>}
            <h1 className="detail-title">{schedule.title}</h1>
            <div className="detail-meta schedule-detail-meta">
              <CalendarDays size={16} aria-hidden="true" />
              <span>{dateFormatter.format(new Date(`${schedule.service_date}T12:00:00+05:30`))}</span>
              {schedule.venue && <span className="schedule-detail-venue"><span aria-hidden="true">·</span> {schedule.venue}</span>}
            </div>
          </header>
          {schedule.description && <p className="section-description">{schedule.description}</p>}
          {schedule.schedule_items.length ? <ol className="programme-list">
            {schedule.schedule_items.map((item) => {
              const song = Array.isArray(item.song) ? item.song[0] : item.song;
              const primary = song
                ? <><span>Song: </span><CachedSongLink className="song-title-link" songId={song.id} updatedAt={song.updated_at}>{song.title}</CachedSongLink></>
                : item.leader_name && item.public_content
                  ? <>{item.item_type === "song" ? "Song leader: " : "Responsible: "}{item.leader_name} · {item.public_content}</>
                  : item.leader_name
                    ? <>{item.item_type === "song" ? "Song leader: " : "Responsible: "}{item.leader_name}</>
                    : item.public_content || (item.item_type === "scripture_reading" ? "Scripture reading" : item.item_type.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase()));
              const details = [
                song && item.leader_name ? `Song leader: ${item.leader_name}` : null,
                item.duration_minutes != null ? `${item.duration_minutes} min` : null,
                item.translator_name ? `Translator: ${item.translator_name}` : null,
                item.translation_language,
              ].filter(Boolean);
              return <li className="programme-item" key={item.id}><div>
                <h2>{item.title}</h2><p>{primary}</p>
                {(details.length > 0 || item.link_url) && <p>{details.join(" · ")}{item.link_url && <>{details.length > 0 && " · "}<a href={item.link_url} target="_blank" rel="noreferrer">{item.link_title || item.link_url}</a></>}</p>}
                {item.media_url && /\.(mp4|webm)(?:$|\?)/i.test(item.media_url)
                  ? <video className="schedule-item-media" src={item.media_url} controls preload="metadata" />
                  : null}
              </div></li>;
            })}
          </ol> : <div className="empty-state" style={{ marginTop: 22 }}>The programme has not been added yet.</div>}
        </article>
      </>}
  </PageShell>;
}

function SlidesPage() {
  const { membership } = useAuth();
  const isOwner = membership?.role === "owner";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scheduleId = searchParams.get("scheduleId");
  const pageValue = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(pageValue) ? Math.min(Math.max(pageValue, 1), 10_000) : 1;
  const loadSlides = useCallback(async () => {
    const supabase = createClient();
    if (scheduleId) {
      const baseQuery = supabase.from("schedules")
        .select("id, title, service_date, venue, schedule_items(id, item_type, title, position, public_content, background_image_url, media_url, show_in_slides, song:songs(id, title, has_translation, start_with_chorus, song_sections(id, section_type, label, position, lyrics, translation, translation_language, is_hidden))), church:churches!inner(id, slug)")
        .eq("id", scheduleId).eq("church.slug", "incoc-south");
      const serviceQuery = isOwner ? baseQuery : baseQuery.eq("status", "published");
      const { data, error } = await serviceQuery.maybeSingle();
      if (error) throw new Error(`Unable to load slide previews: ${error.message}`);
      if (!data) throw new Error("This service is not available.");
      const slides = generateSlides(normalizeProgrammeItems(data.schedule_items ?? []));
      return { schedule: data, groups: groupPresentationSlides(slides), schedules: [], count: 0, churchId: "" };
    }
    const baseQuery = supabase.from("schedules")
      .select("id, title, service_date, venue, description, updated_at, church:churches!inner(id, slug)", { count: "exact" })
      .eq("church.slug", "incoc-south");
    const visibleSchedulesQuery = isOwner ? baseQuery : baseQuery.eq("status", "published");
    const [{ data, error, count }, { data: church, error: churchError }] = await Promise.all([
      visibleSchedulesQuery.order("service_date", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      supabase.from("churches").select("id").eq("slug", "incoc-south").maybeSingle(),
    ]);
    if (error) throw new Error(`Unable to load presentations: ${error.message}`);
    if (churchError) throw new Error(`Unable to identify the church for presentation updates: ${churchError.message}`);
    return { schedule: null, groups: [], schedules: data ?? [], count: count ?? 0, churchId: data?.[0]?.church.id ?? church?.id ?? membership?.churchId ?? "" };
  }, [isOwner, membership?.churchId, page, scheduleId]);
  const resource = useAsyncResource(`slides:${scheduleId ?? "list"}:${page}:${isOwner ? "owner" : "viewer"}`, loadSlides);
  const schedule = resource.data?.schedule;
  const schedules = resource.data?.schedules ?? [];
  const hasNextPage = schedules.length > PAGE_SIZE;
  const loadPublishedServices = useCallback(() => loadPublishedSchedules(1), []);
  const publishedServices = useAsyncResource("schedules:1", loadPublishedServices);
  const soleService = isOwner
    ? publishedServices.data?.schedules[0]
    : schedules[0] ?? publishedServices.data?.schedules[0];
  const serviceCount = isOwner ? publishedServices.data?.count : resource.data?.count;
  const openingSoleService = !scheduleId && serviceCount === 1;

  useEffect(() => {
    if (resource.error && scheduleId) navigate("/slides", { replace: true });
  }, [navigate, resource.error, scheduleId]);
  useEffect(() => {
    if (!scheduleId && serviceCount === 1 && soleService) {
      navigate(`/slides?scheduleId=${encodeURIComponent(soleService.id)}`, { replace: true });
    }
  }, [navigate, scheduleId, serviceCount, soleService]);

  return <PageShell owner={isOwner}>
    {resource.error && !resource.data ? <ResourceMessage error={resource.error} retry={resource.refresh} /> : (resource.loading && !resource.data) || (!scheduleId && isOwner && !publishedServices.data && !publishedServices.error) || (openingSoleService && !publishedServices.error)
      ? <div className="content-wrap"><div className="section-heading"><h1>Slides</h1></div><InlineLoading>Loading presentations…</InlineLoading></div>
      : schedule && resource.data
        ? <>
          {resource.error && <ResourceMessage error={`The latest presentation refresh failed: ${resource.error}`} retry={resource.refresh} />}
          {publishedServices.error && <ResourceMessage error={`Unable to check available services: ${publishedServices.error}`} retry={publishedServices.refresh} />}
          {resource.loading && <div className="content-wrap"><InlineLoading>Checking for presentation updates…</InlineLoading></div>}
          <RealtimeRefresh subscriptions={[
            { table: "schedules", column: "id", value: schedule.id },
            { table: "schedule_items", column: "schedule_id", value: schedule.id },
            ...(schedule.church?.id ? [{ table: "schedules" as const, column: "church_id", value: schedule.church.id }] : []),
          ]} onDelete={(deletedId) => {
            if (deletedId === schedule.id) navigate("/slides", { replace: true });
          }} />
          <div className="content-wrap slides-overview">
            {publishedServices.data?.count > 1 && <IntentPrefetchLink href="/slides" className="back-link"><ArrowLeft size={15} /> All services</IntentPrefetchLink>}
            <div className="slides-overview-heading">
              <h1 className="detail-title">{schedule.title}</h1>
              {isOwner && <IntentPrefetchLink className="schedule-edit-link" href={`/admin/schedules/${schedule.id}`}>Edit schedule</IntentPrefetchLink>}
            </div>
            <p className="slides-overview-meta"><CalendarDays size={15} aria-hidden="true" />{dateFormatter.format(new Date(`${schedule.service_date}T12:00:00+05:30`))}{schedule.venue && <span>{schedule.venue}</span>}</p>
            {resource.data.groups.length ? <div className="slides-preview-grid">
              {resource.data.groups.map((group) => {
                const media = group.mediaUrl || group.backgroundImageUrl;
                return <Link className="slides-preview-card" to={`/present/${schedule.id}?slide=${group.firstSlideIndex}`} key={group.itemId}>
                  <h2 className="slides-preview-title">{group.itemTitle}</h2>
                  {media
                    ? /\.(mp4|webm)(?:$|\?)/i.test(media)
                      ? <video className="slides-preview-image" src={media} muted autoPlay loop playsInline />
                      : <img className="slides-preview-image" src={media} alt="" loading="lazy" />
                    : <>
                      {group.itemSubtitle && <p className="slides-preview-subtitle">{group.itemSubtitle}</p>}
                      {group.content && <p className="slides-preview-content">{group.content}</p>}
                    </>}
                </Link>;
              })}
            </div> : <div className="empty-state">There are no presentation slides for this service.</div>}
          </div>
        </>
        : <>
          {resource.data?.churchId && <RealtimeRefresh subscriptions={[{ table: "schedules", column: "church_id", value: resource.data.churchId }]} />}
          <div className="content-wrap">
            <div className="section-heading"><h1>Slides</h1></div>
            {publishedServices.error && <ResourceMessage error={`Unable to check published services: ${publishedServices.error}`} retry={publishedServices.refresh} />}
            {resource.loading && resource.data && <InlineLoading>Checking for presentation updates…</InlineLoading>}
            {schedules.length ? <div className="results-list">
              {schedules.slice(0, PAGE_SIZE).map((item) => <article className="public-list-entry" key={item.id}>
                <IntentPrefetchLink className="result-card" href={`/slides?scheduleId=${item.id}`}>
                  <div><h2>{item.title}</h2><p><CalendarDays size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />{dateFormatter.format(new Date(`${item.service_date}T12:00:00+05:30`))}{item.venue ? ` · ${item.venue}` : ""}</p></div>
                  <span className="public-entry-meta"><MonitorPlay size={15} /> View slides <ArrowRight size={15} /></span>
                </IntentPrefetchLink>
                {isOwner && <IntentPrefetchLink className="schedule-edit-link" href={`/admin/schedules/${item.id}`}>Edit schedule</IntentPrefetchLink>}
              </article>)}
            </div> : <div className="empty-state">There are no presentations yet.</div>}
            {(page > 1 || hasNextPage) && <nav className="list-pagination" aria-label="Slides pages">
              {page > 1 && <Link className="button button-secondary" to={`/slides?page=${page - 1}`}>Newer services</Link>}
              {hasNextPage && <Link className="button button-secondary" to={`/slides?page=${page + 1}`}>Older services</Link>}
            </nav>}
          </div>
        </>}
  </PageShell>;
}

function PresentationPage() {
  const { scheduleId = "" } = useParams();
  const { user, membership } = useAuth();
  const isOwner = membership?.role === "owner";
  const [searchParams] = useSearchParams();
  const requested = Number.parseInt(searchParams.get("slide") ?? "0", 10);
  const initialSlide = Number.isFinite(requested) ? requested : 0;
  const loadPresentation = useCallback(async () => {
    const baseQuery = createClient().from("schedules")
      .select("id, title, schedule_items(id, item_type, title, position, public_content, background_image_url, media_url, show_in_slides, song:songs(id, title, has_translation, start_with_chorus, song_sections(id, section_type, label, position, lyrics, translation, translation_language, is_hidden))), church:churches!inner(slug)")
      .eq("id", scheduleId).eq("church.slug", "incoc-south");
    const serviceQuery = isOwner ? baseQuery : baseQuery.eq("status", "published");
    const { data, error } = await serviceQuery.maybeSingle();
    if (error) throw new Error(`Unable to load presentation: ${error.message}`);
    if (!data) throw new Error("This presentation is not available.");
    const items = data.schedule_items ?? [];
    const presentationItems = filterPresentationItems(normalizeProgrammeItems(items));
    return {
      schedule: data,
      slides: generateSlides(presentationItems),
      songIds: presentationItems.map((item) => item.song?.id).filter((id): id is string => Boolean(id)),
    };
  }, [isOwner, scheduleId]);
  const resource = useAsyncResource(`presentation:${scheduleId}:${isOwner ? "owner" : "viewer"}`, loadPresentation);
  if (resource.error) return <main className="presentation-page"><p role="alert">{resource.error}</p><Link to="/slides">Return to Slides</Link></main>;
  if (!resource.data) return <main className="presentation-page">
    <InlineLoading>Loading presentation…</InlineLoading>
    <Link to="/slides">Return to Slides</Link>
  </main>;
  return <Suspense fallback={<main className="presentation-page"><InlineLoading>Loading presentation…</InlineLoading></main>}>
    <Presentation
      key={`${scheduleId}-${initialSlide}`}
      scheduleId={scheduleId}
      scheduleTitle={resource.data.schedule.title}
      refreshing={resource.loading}
      initialSlide={initialSlide}
      slides={resource.data.slides}
      isOwner={membership?.role === "owner"}
      canReadSession={Boolean(membership)}
      userId={user?.id ?? null}
      songIds={resource.data.songIds}
    />
  </Suspense>;
}

function OwnerOnly() {
  const { configured, error, loading, membership } = useAuth();
  if (!configured) return <PageShell><ResourceMessage error="Owner tools are unavailable until Supabase is configured." /></PageShell>;
  if (loading) return <PageShell><LoadingPage title="Checking owner access" /></PageShell>;
  if (error) return <PageShell><ResourceMessage error={error} /></PageShell>;
  if (!membership) return <Navigate to="/login" replace />;
  if (membership.role !== "owner") return <Navigate to="/access-denied" replace />;
  return <AdminLayout />;
}

function AdminLayout() {
  return <PageShell owner>
    <div className="admin-layout">
      <UnsavedChangesGuard />
      <aside className="admin-nav" aria-label="Owner navigation">
        <IntentPrefetchLink href="/admin/songs">Songs</IntentPrefetchLink>
        <IntentPrefetchLink href="/admin/schedules">Sunday Schedule &amp; Slides</IntentPrefetchLink>
        <IntentPrefetchLink href="/admin/members">Members</IntentPrefetchLink>
        <IntentPrefetchLink href="/admin/settings">Settings</IntentPrefetchLink>
      </aside>
      <section className="admin-content"><Outlet /></section>
    </div>
  </PageShell>;
}

function AdminSongsPage() {
  const { membership } = useAuth();
  const loadSongs = useCallback(async () => {
    const { data, error } = await createClient().from("songs")
      .select("id, title, language, author, updated_at")
      .eq("church_id", membership?.churchId ?? "").order("title").limit(100);
    if (error) throw new Error(`Unable to load songs: ${error.message}`);
    return data ?? [];
  }, [membership?.churchId]);
  const resource = useAsyncResource("admin:songs", loadSongs);
  return resource.loading && !resource.data ? <LoadingPage title="Manage songs" /> : resource.error
    ? <ResourceMessage error={resource.error} retry={resource.refresh} />
    : <>
      <p className="eyebrow">LIBRARY</p>
      <div className="admin-title-row"><h1>Manage songs</h1><Link className="button button-primary" to="/admin/songs/new"><Plus size={16} /> Add a song</Link></div>
      <p>Each song lives once in the library and can be reused across services.</p>
      {resource.data?.length ? <div className="results-list admin-results">{resource.data.map((song) => <IntentPrefetchLink className="result-card" href={`/admin/songs/${song.id}`} key={song.id}><div><h2>{song.title}</h2><p>{song.language}{song.author ? ` · ${song.author}` : ""}</p></div><span className="muted">Edit</span></IntentPrefetchLink>)}</div>
        : <div className="empty-state">No songs yet. Add the first song to begin your library.</div>}
    </>;
}

function AdminSongCreatePage() {
  return <>
    <IntentPrefetchLink href="/admin/songs" className="back-link"><ArrowLeft size={15} /> Back to songs</IntentPrefetchLink>
    <p className="eyebrow">ADD TO THE LIBRARY</p><h1>New song</h1>
    <p>Add the song and organize its verses, chorus, and translations before saving.</p>
    <Suspense fallback={<InlineLoading>Loading song editor…</InlineLoading>}><SongEditorForm /></Suspense>
  </>;
}

function AdminSongEditPage() {
  const { songId = "" } = useParams();
  const { membership } = useAuth();
  const loadSong = useCallback(async () => {
    const { data, error } = await createClient().from("songs")
      .select("id, title, language, author, source, has_translation, start_with_chorus, updated_at, song_sections(id, section_type, label, position, lyrics, translation, translation_language, is_hidden)")
      .eq("id", songId).eq("church_id", membership?.churchId ?? "").maybeSingle();
    if (error) throw new Error(`Unable to load song: ${error.message}`);
    if (!data) throw new Error("This song is not available.");
    return { ...data, song_sections: [...(data.song_sections ?? [])].sort((a, b) => a.position - b.position) };
  }, [membership?.churchId, songId]);
  const resource = useAsyncResource(`admin:song:${songId}`, loadSong);
  const song = resource.data;
  if (resource.loading && !song) return <LoadingPage title="Edit song" />;
  if (resource.error) return <ResourceMessage error={resource.error} retry={resource.refresh} />;
  if (!song) return <ResourceMessage error="This song is not available." />;
  return <>
    <IntentPrefetchLink href="/admin/songs" className="back-link"><ArrowLeft size={15} /> Back to songs</IntentPrefetchLink>
    <p className="eyebrow">EDIT SONG</p><h1>{song.title}</h1>
    <Suspense fallback={<InlineLoading>Loading song editor…</InlineLoading>}><SongEditorForm song={{
      id: song.id, updated_at: song.updated_at, title: song.title, language: song.language,
      author: song.author, source: song.source, has_translation: song.has_translation,
      start_with_chorus: song.start_with_chorus,
      sections: song.song_sections.map((section) => ({
        id: section.id, section_type: section.section_type, label: section.label ?? "",
        lyrics: section.lyrics, translation: section.translation ?? "",
        translation_language: section.translation_language ?? "", is_hidden: section.is_hidden,
      })),
    }} /></Suspense>
    <form className="delete-song-form"><input type="hidden" name="song_id" value={song.id} />
      <ConfirmButton action={deleteSong} title="Delete song?" message="This permanently deletes the song from the Songbook. A song used by a schedule cannot be deleted." className="button button-danger" pendingLabel="Deleting…">Delete song</ConfirmButton>
    </form>
  </>;
}

function AdminSchedulesPage() {
  const { membership } = useAuth();
  const loadSchedules = useCallback(async () => {
    const { data, error } = await createClient().from("schedules")
      .select("id, title, service_date, venue").eq("church_id", membership?.churchId ?? "")
      .order("service_date", { ascending: false }).limit(100);
    if (error) throw new Error(`Unable to load schedules: ${error.message}`);
    return data ?? [];
  }, [membership?.churchId]);
  const resource = useAsyncResource("admin:schedules", loadSchedules);
  if (resource.loading && !resource.data) return <LoadingPage title="Schedules" />;
  if (resource.error) return <ResourceMessage error={resource.error} retry={resource.refresh} />;
  return <>
    {membership?.churchId && <RealtimeRefresh subscriptions={[{ table: "schedules", column: "church_id", value: membership.churchId }]} />}
    <p className="eyebrow">SERVICE PLANNING</p>
    <div className="admin-title-row"><h1>Schedules</h1><Link className="button button-primary" to="/admin/schedules/new"><Plus size={16} /> Create schedule</Link></div>
    <p>Each schedule is a dated gathering.</p>
    {resource.data?.length ? <div className="results-list admin-results">{resource.data.map((schedule) => <IntentPrefetchLink className="result-card" href={`/admin/schedules/${schedule.id}`} key={schedule.id}>
      <div><h2>{schedule.title}</h2><p>{dateFormatter.format(new Date(`${schedule.service_date}T12:00:00+05:30`))}{schedule.venue ? ` · ${schedule.venue}` : ""}</p></div><span className="muted">Edit</span>
    </IntentPrefetchLink>)}</div> : <div className="empty-state">No service schedules yet. Create one to start planning.</div>}
  </>;
}

function AdminScheduleCreatePage() {
  return <>
    <IntentPrefetchLink href="/admin/schedules" className="back-link"><ArrowLeft size={15} /> Back to schedules</IntentPrefetchLink>
    <h1 className="detail-title">Create Sunday Schedule</h1>
    <Suspense fallback={<InlineLoading>Loading schedule editor…</InlineLoading>}><NewScheduleForm /></Suspense>
  </>;
}

function AdminScheduleEditPage() {
  const { scheduleId = "" } = useParams();
  const { membership } = useAuth();
  const navigate = useNavigate();
  const loadSchedule = useCallback(async () => {
    const { data: schedule, error } = await createClient().from("schedules")
      .select("id, title, service_date, venue, description, updated_at, schedule_items(id, item_type, title, position, leader_name, translator_name, translation_language, duration_minutes, public_content, link_title, link_url, media_url, background_image_url, song_id, show_in_slides, updated_at, song:songs(id, title))")
      .eq("id", scheduleId).eq("church_id", membership?.churchId ?? "").maybeSingle();
    if (error) throw new Error(`Unable to load service: ${error.message}`);
    if (!schedule) throw new Error("This schedule is not available.");
    const items = [...(schedule.schedule_items ?? [])].sort((a, b) => a.position - b.position);
    return { schedule, items };
  }, [membership?.churchId, scheduleId]);
  const resource = useAsyncResource(`admin:schedule:${scheduleId}`, loadSchedule);
  const loadSongs = useCallback(async () => {
    const { data, error } = await createClient().from("songs").select("id, title, language")
      .eq("church_id", membership?.churchId ?? "").order("title").limit(1000);
    if (error) throw new Error(`Unable to load Songbook: ${error.message}`);
    return data ?? [];
  }, [membership?.churchId]);
  const songsResource = useAsyncResource(`admin:schedule-songs:${membership?.churchId ?? ""}`, loadSongs);
  const itemIds = resource.data?.items.map(({ id }) => id).join(",") ?? "";
  const loadNotes = useCallback(async () => {
    if (!itemIds) return {};
    const { data, error } = await createClient().from("schedule_item_notes")
      .select("schedule_item_id, notes").in("schedule_item_id", itemIds.split(","));
    if (error) throw new Error(`Unable to load private service notes: ${error.message}`);
    return Object.fromEntries((data ?? []).map(({ schedule_item_id, notes }) => [schedule_item_id, notes]));
  }, [itemIds]);
  const notesResource = useAsyncResource(`admin:schedule-notes:${scheduleId}:${itemIds}`, loadNotes);
  if (resource.error && !resource.data) return <ResourceMessage error={resource.error} retry={resource.refresh} />;
  if (!resource.data) return <>
    <IntentPrefetchLink href="/admin/schedules" className="back-link"><ArrowLeft size={15} /> Back to schedules</IntentPrefetchLink>
    <h1 className="detail-title">Edit schedule</h1>
    <InlineLoading>Loading schedule details…</InlineLoading>
  </>;
  const scheduleItems = resource.data.items.map((item) => ({
    ...item,
    notes: notesResource.data?.[item.id] ?? "",
  }));
  return <>
    {resource.error && <ResourceMessage error={`The latest schedule refresh failed: ${resource.error}`} retry={resource.refresh} />}
    <RealtimeRefresh
      subscriptions={[{ table: "schedules", column: "id", value: resource.data.schedule.id }]}
      onDelete={(deletedId) => {
        if (deletedId === resource.data?.schedule.id) navigate("/admin/schedules", { replace: true });
      }}
    />
    <IntentPrefetchLink href="/schedule" className="back-link"><ArrowLeft size={15} /> Back to Sunday Schedule</IntentPrefetchLink>
    <h1 className="detail-title">{resource.data.schedule.title}</h1>
    <Suspense fallback={<InlineLoading>Loading schedule editor…</InlineLoading>}>
      <InlineScheduleDetails schedule={resource.data.schedule} />
      {notesResource.error && <ResourceMessage error={notesResource.error} retry={notesResource.refresh} />}
      {songsResource.error && <ResourceMessage error={songsResource.error} retry={songsResource.refresh} />}
      {(resource.loading || notesResource.loading || songsResource.loading) && <InlineLoading>Loading schedule options…</InlineLoading>}
      <section className="schedule-items-editor" aria-label="Schedule Items">
        <h2>Schedule Items</h2>
        <InlineScheduleManager
          schedule={resource.data.schedule}
          items={scheduleItems}
          songs={songsResource.data ?? []}
          privateNotesReady={Boolean(notesResource.data) && !notesResource.error}
          songsReady={Boolean(songsResource.data)}
          returnTo={`/admin/schedules/${resource.data.schedule.id}`}
          churchId={membership?.churchId ?? ""}
        />
      </section>
      <ScheduleActions schedule={resource.data.schedule} />
    </Suspense>
  </>;
}

function AdminMembersPage() {
  const { membership, user } = useAuth();
  const loadMembers = useCallback(async () => {
    const { data, error } = await createClient().from("church_members")
      .select("user_id, role, created_at, profile:profiles(display_name)")
      .eq("church_id", membership?.churchId ?? "").order("created_at");
    if (error) throw new Error(`Unable to load church members: ${error.message}`);
    return data ?? [];
  }, [membership?.churchId]);
  const resource = useAsyncResource("admin:members", loadMembers);
  if (resource.loading && !resource.data) return <LoadingPage title="Members" />;
  if (resource.error) return <ResourceMessage error={resource.error} retry={resource.refresh} />;
  return <>
    <p className="eyebrow">ACCESS CONTROL</p><h1>Members</h1>
    <p>Public songs and services are available without signing in. Assign owner access only to trusted administrators.</p>
    <div className="member-list">{resource.data?.map((item) => {
      const profile = Array.isArray(item.profile) ? item.profile[0] : item.profile;
      return <article className="member-row" key={item.user_id}>
        <div><h2>{profile?.display_name || "Church member"}</h2><p>{item.user_id === user?.id ? "You · " : ""}Added {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(item.created_at))}</p></div>
        <div className="member-actions">
          <Suspense fallback={<InlineLoading>Loading member controls…</InlineLoading>}>
            <MemberRoleForm userId={item.user_id} displayName={profile?.display_name || "member"} role={item.role} disabled={item.user_id === user?.id} />
          </Suspense>
          {item.user_id !== user?.id && <form><input type="hidden" name="user_id" value={item.user_id} />
            <ConfirmButton action={removeMember} title="Remove member?" message={`Remove ${profile?.display_name || "this member"} from the church? They will lose access to private content.`} className="icon-button danger"><Trash2 size={15} /></ConfirmButton>
          </form>}
        </div>
      </article>;
    })}</div>
    <h2 className="admin-section-title">Invite a member</h2>
    <p className="muted">Supabase sends a sign-in invitation. New members set their password after opening the email link.</p>
    <Suspense fallback={<InlineLoading>Loading invitation form…</InlineLoading>}><InviteMemberForm /></Suspense>
    {!import.meta.env.VITE_SUPABASE_URL ? null
      : <p className="notice">Member invitations require the server-only SUPABASE_SERVICE_ROLE_KEY on Vercel. Never expose it to the browser.</p>}
  </>;
}

function AdminSettingsPage() {
  const configured = Boolean(getSupabasePublicConfig().url && getSupabasePublicConfig().key);
  return <>
    <p className="eyebrow">APPLICATION</p><h1>Settings</h1>
    <p>INCOC South is configured for Indian Church of Christ, South Sector.</p>
    <dl className="settings-list">
      <div><dt>Application</dt><dd>INCOC South (<code>incoc-south</code>)</dd></div>
      <div><dt>Organization</dt><dd>Indian Church of Christ</dd></div>
      <div><dt>Ministry</dt><dd>South Sector</dd></div>
      <div><dt>Church timezone</dt><dd>Asia/Kolkata</dd></div>
      <div><dt>Supabase</dt><dd>{configured ? "Configured" : "Not configured"}</dd></div>
      <div><dt>Presentation links</dt><dd>Disabled. Synchronized presentations require signed-in church members.</dd></div>
    </dl>
    <div className="notice">Database credentials and deployment variables are managed outside the browser in the project environment.</div>
  </>;
}

function LoginPage() {
  const { configured, loading, membership, user } = useAuth();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  if (loading) return <main className="auth-page" role="status" aria-busy="true">Checking sign-in…</main>;
  if (user) return <Navigate to={membership ? returnTo : "/access-denied"} replace />;
  return <main className="auth-page">
    <section className="auth-card">
      <Link className="auth-brand" to="/"><BrandMark /> INCOC South</Link>
      <p className="eyebrow">INDIAN CHURCH OF CHRIST</p><h1>Welcome back</h1>
      <p className="muted">Sign-in is restricted to the website owner.</p>
      {configured ? <Suspense fallback={<InlineLoading>Loading sign-in form…</InlineLoading>}><LoginForm /></Suspense> : <div className="notice notice-warning" role="status">Sign-in is unavailable until Supabase is configured. Follow the setup guide in the project README.</div>}
      <p className="auth-footnote">Songs, Sunday schedules, and slides are available without signing in.</p>
    </section>
  </main>;
}

function AccountSetupPage() {
  const { loading, user, membership } = useAuth();
  if (loading) return <main className="auth-page" role="status" aria-busy="true">Checking invitation…</main>;
  if (!user || !membership) return <Navigate to="/login" replace />;
  if (user.email_confirmed_at == null) return <main className="auth-page"><section className="auth-card"><h1>Confirm your invitation</h1><p>Open the invitation link from your email before setting a password.</p></section></main>;
  return <main className="auth-page"><section className="auth-card">
    <Link className="auth-brand" to="/"><BrandMark /> INCOC South</Link>
    <p className="eyebrow">ACCOUNT SETUP</p><h1>Choose a password</h1>
    <p className="muted">Use at least 12 characters.</p>
    <Suspense fallback={<InlineLoading>Loading setup form…</InlineLoading>}><SetupForm /></Suspense>
  </section></main>;
}

function AuthCallbackPage() {
  const navigate = useNavigate();
  const { refreshSession } = useAuth();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const callback = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (!code) throw new Error("This invitation link is invalid or has expired.");
      const { error: exchangeError } = await createClient().auth.exchangeCodeForSession(code);
      if (exchangeError) throw new Error(`Unable to complete the invitation: ${exchangeError.message}`);
      await refreshSession();
      const destination = url.searchParams.get("next");
      navigate(destination === "/account/setup" ? destination : "/account/setup", { replace: true });
    };
    void callback().catch((callbackError: unknown) => {
      if (active) setError(callbackError instanceof Error ? callbackError.message : "Unable to complete the invitation.");
    });
    return () => { active = false; };
  }, [navigate, refreshSession]);
  return <main className="auth-page" role={error ? undefined : "status"} aria-busy={!error}>
    {error ? <section className="auth-card"><h1>Invitation error</h1><p className="form-error">{error}</p><Link to="/login">Return to sign in</Link></section> : "Completing invitation…"}
  </main>;
}

function AccessDeniedPage() {
  return <PageShell><div className="content-wrap"><p className="eyebrow">ACCESS CONTROL</p><h1>Access restricted</h1><p>You need an active church membership to use owner tools.</p><Link className="button button-secondary" to="/song">Return to the Songbook</Link></div></PageShell>;
}

function NotFoundPage() {
  return <PageShell><div className="content-wrap"><h1>Page not found</h1><p>The page you requested is not available.</p><Link to="/song">Return to the Songbook</Link></div></PageShell>;
}

export function App() {
  return <>
    <ScrollPositionRestoration />
    <Suspense fallback={<main className="route-loading" role="status">Loading INCOC South…</main>}>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/song" element={<SongbookPage />} />
      <Route path="/song/:songId" element={<SongDetailPage />} />
      <Route path="/songbook" element={<Navigate to="/song" replace />} />
      <Route path="/songbook/:songId" element={<SongbookSongRedirect />} />
      <Route path="/schedule" element={<ScheduleListPage />} />
      <Route path="/schedule/:scheduleId" element={<ScheduleDetailPage />} />
      <Route path="/schedule/:scheduleId/slides" element={<ScheduleSlidesRedirect />} />
      <Route path="/slides" element={<SlidesPage />} />
      <Route path="/present/:scheduleId" element={<PresentationPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/account/setup" element={<AccountSetupPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/access-denied" element={<AccessDeniedPage />} />
      <Route path="/admin" element={<OwnerOnly />}>
        <Route index element={<Navigate to="/admin/songs" replace />} />
        <Route path="songs" element={<AdminSongsPage />} />
        <Route path="songs/new" element={<AdminSongCreatePage />} />
        <Route path="songs/:songId" element={<AdminSongEditPage />} />
        <Route path="schedules" element={<AdminSchedulesPage />} />
        <Route path="schedules/new" element={<AdminScheduleCreatePage />} />
        <Route path="schedules/:scheduleId" element={<AdminScheduleEditPage />} />
        <Route path="members" element={<AdminMembersPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
  </>;
}

function SongbookSongRedirect() {
  const { songId = "" } = useParams();
  return <Navigate to={`/song/${songId}`} replace />;
}

function ScheduleSlidesRedirect() {
  const { scheduleId = "" } = useParams();
  return <Navigate to={`/slides?scheduleId=${scheduleId}`} replace />;
}
