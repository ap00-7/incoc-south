import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { deleteSong } from "@/app/admin/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { SongEditorForm } from "@/components/admin/song-creation-form";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export default async function EditSongPage({ params }: { params: Promise<{ songId: string }> }) {
  await connection();
  if (!isSupabaseConfigured()) return null;
  const membership = await getMembership();
  if (!membership) return null;
  const { songId } = await params;
  const supabase = await createClient();
  const { data: song, error } = await supabase.from("songs")
    .select("id, title, language, author, source, has_translation, start_with_chorus, updated_at, song_sections(id, section_type, label, position, lyrics, translation, translation_language, is_hidden)")
    .eq("id", songId).eq("church_id", membership.churchId).maybeSingle();
  if (error) throw new Error(`Unable to load song: ${error.message}`);
  if (!song) notFound();
  const sections = [...(song.song_sections ?? [])].sort((a, b) => a.position - b.position);

  return <>
    <Link href="/admin/songs" className="back-link"><ArrowLeft size={15} /> Back to songs</Link>
    <p className="eyebrow">EDIT SONG</p><h1>{song.title}</h1>
    <SongEditorForm song={{
      id: song.id,
      updated_at: song.updated_at,
      title: song.title,
      language: song.language,
      author: song.author,
      source: song.source,
      has_translation: song.has_translation,
      start_with_chorus: song.start_with_chorus,
      sections: sections.map((section) => ({
        id: section.id,
        section_type: section.section_type,
        label: section.label ?? "",
        lyrics: section.lyrics,
        translation: section.translation ?? "",
        translation_language: section.translation_language ?? "",
        is_hidden: section.is_hidden,
      })),
    }} />
    <form className="delete-song-form"><input type="hidden" name="song_id" value={song.id} /><ConfirmButton action={deleteSong} title="Delete song?" message="This permanently deletes the song from the Songbook. A song used by a schedule cannot be deleted." className="button button-danger" pendingLabel="Deleting…"><Trash2 size={15} /> Delete song</ConfirmButton></form>
  </>;
}
