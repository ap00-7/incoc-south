import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Presentation } from "@/components/presentation";
import { getMembership, hasSupabaseAuthCookie } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { generateSlides, normalizeProgrammeItems } from "@/lib/domain/slides";

type Props = { params: Promise<{ scheduleId: string }> };

export default function PresentPage({ params }: Props) {
  return (
    <Suspense fallback={<main className="presentation-page" role="status" aria-busy="true">Loading presentation…</main>}>
      <PresentationContent params={params} />
    </Suspense>
  );
}

async function PresentationContent({ params }: Props) {
  await connection();
  if (!isSupabaseConfigured()) notFound();
  const { scheduleId } = await params;
  const [supabase, hasAuthCookie] = await Promise.all([createClient(), hasSupabaseAuthCookie()]);
  const membershipPromise = hasAuthCookie ? getMembership(supabase) : Promise.resolve(null);
  const [membership, { data: schedule, error }] = await Promise.all([
    membershipPromise,
    supabase.from("schedules")
    .select("id, title, status, schedule_items(id, item_type, title, position, public_content, background_image_url, song:songs(id, title, has_translation, start_with_chorus, song_sections(id, section_type, label, position, lyrics, translation, translation_language, is_hidden))), church:churches!inner(slug)")
    .eq("id", scheduleId).eq("church.slug", "incoc-south").maybeSingle(),
  ]);
  if (error) throw new Error(`Unable to load presentation: ${error.message}`);
  if (!schedule || (schedule.status !== "published" && membership?.role !== "owner")) notFound();
  const programmeItems = schedule.schedule_items ?? [];
  const slides = generateSlides(normalizeProgrammeItems(programmeItems));
  const songIds = programmeItems.map((item) => item.song?.id).filter((id): id is string => Boolean(id));
  return <Presentation
    scheduleId={scheduleId}
    scheduleTitle={schedule.title}
    slides={slides}
    isOwner={membership?.role === "owner"}
    canReadSession={Boolean(membership)}
    userId={membership?.user.id ?? null}
    songIds={songIds}
  />;
}
