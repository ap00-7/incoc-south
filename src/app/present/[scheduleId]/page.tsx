import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Presentation } from "@/components/presentation";
import { getMembership } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getPublicChurchContext } from "@/lib/supabase/public-content";
import { generateSlides, normalizeProgrammeItems } from "@/lib/domain/slides";

export const instant = false;

export default async function PresentPage({ params }: { params: Promise<{ scheduleId: string }> }) {
  await connection();
  if (!isSupabaseConfigured()) notFound();
  const { scheduleId } = await params;
  const [membership, { supabase, churchId }] = await Promise.all([
    getMembership(),
    getPublicChurchContext(),
  ]);
  const { data: schedule, error } = await supabase.from("schedules")
    .select("id, title, status, schedule_items(id, item_type, title, position, public_content, song:songs(id, title, song_sections(id, section_type, label, position, lyrics, translation, translation_language)))")
    .eq("id", scheduleId).eq("church_id", churchId).maybeSingle();
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
