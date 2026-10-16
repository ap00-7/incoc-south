import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { addSongSection, deleteSong, deleteSongSection, moveSongSection, updateSong, updateSongSection } from "@/app/admin/actions";
import { ConfirmButton } from "@/components/confirm-button";
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
    .select("id, title, language, author, source, updated_at, song_sections(id, section_type, label, position, lyrics, updated_at)")
    .eq("id", songId).eq("church_id", membership.churchId).maybeSingle();
  if (error) throw new Error(`Unable to load song: ${error.message}`);
  if (!song) notFound();
  const sections = [...(song.song_sections ?? [])].sort((a, b) => a.position - b.position);

  return <>
    <Link href="/admin/songs" className="back-link"><ArrowLeft size={15} /> Back to songs</Link>
    <p className="eyebrow">EDIT SONG</p><h1>{song.title}</h1>
    <form className="form-stack admin-form" action={updateSong} data-dirty-form>
      <input type="hidden" name="song_id" value={song.id} />
      <input type="hidden" name="expected_updated_at" value={song.updated_at} />
      <label htmlFor="title">Title</label><input id="title" name="title" required defaultValue={song.title} maxLength={200} />
      <label htmlFor="language">Language</label><input id="language" name="language" required defaultValue={song.language} maxLength={80} />
      <label htmlFor="author">Author</label><input id="author" name="author" defaultValue={song.author ?? ""} maxLength={200} />
      <label htmlFor="source">Source</label><input id="source" name="source" defaultValue={song.source ?? ""} maxLength={300} />
      <button className="button button-primary">Save song details</button>
    </form>
    <div className="admin-subheading"><div><p className="eyebrow">LYRICS</p><h2>Sections</h2></div></div>
    {sections.length ? <div className="section-admin-list">
      {sections.map((section, index) => <article className="section-admin-card" key={section.id}>
        <div className="section-admin-heading"><h3>{section.label?.trim() || section.section_type.replaceAll("_", " ")}</h3>
          <div className="mini-actions">
            <form action={moveSongSection}><input type="hidden" name="section_id" value={section.id} /><input type="hidden" name="direction" value="-1" /><button className="icon-button" aria-label={`Move ${section.label ?? section.section_type} up`} disabled={index === 0}><ArrowUp size={15} /></button></form>
            <form action={moveSongSection}><input type="hidden" name="section_id" value={section.id} /><input type="hidden" name="direction" value="1" /><button className="icon-button" aria-label={`Move ${section.label ?? section.section_type} down`} disabled={index === sections.length - 1}><ArrowDown size={15} /></button></form>
            <form><input type="hidden" name="section_id" value={section.id} /><ConfirmButton action={deleteSongSection} message="Delete this lyric section? This cannot be undone." className="icon-button danger"><Trash2 size={15} /></ConfirmButton></form>
          </div>
        </div>
          <form className="form-stack section-edit-form" action={updateSongSection} data-dirty-form>
            <input type="hidden" name="song_id" value={song.id} />
            <input type="hidden" name="section_id" value={section.id} />
            <input type="hidden" name="expected_updated_at" value={section.updated_at} />
            <label htmlFor={`section-type-${section.id}`}>Section type</label>
            <select id={`section-type-${section.id}`} name="section_type" defaultValue={section.section_type}>
              <option value="verse">Verse</option><option value="chorus">Chorus</option><option value="pre_chorus">Pre-chorus</option><option value="bridge">Bridge</option><option value="intro">Intro</option><option value="outro">Outro</option><option value="other">Other</option>
            </select>
            <label htmlFor={`section-label-${section.id}`}>Label</label><input id={`section-label-${section.id}`} name="section_label" defaultValue={section.label ?? ""} maxLength={100} />
            <label htmlFor={`section-lyrics-${section.id}`}>Lyrics</label><textarea id={`section-lyrics-${section.id}`} name="lyrics" defaultValue={section.lyrics} rows={5} maxLength={20000} />
            <button className="button button-secondary">Save section</button>
          </form>
      </article>)}
    </div> : <div className="empty-state">No lyric sections have been added.</div>}
    <h2 className="admin-section-title">Add a section</h2>
    <form className="form-stack admin-form" action={addSongSection} data-dirty-form>
      <input type="hidden" name="song_id" value={song.id} />
      <label htmlFor="section_type">Section type</label><select id="section_type" name="section_type" defaultValue="verse"><option value="verse">Verse</option><option value="chorus">Chorus</option><option value="pre_chorus">Pre-chorus</option><option value="bridge">Bridge</option><option value="intro">Intro</option><option value="outro">Outro</option><option value="other">Other</option></select>
      <label htmlFor="section_label">Custom label</label><input id="section_label" name="section_label" maxLength={100} />
      <label htmlFor="lyrics">Lyrics</label><textarea id="lyrics" name="lyrics" rows={6} required maxLength={20000} />
      <button className="button button-secondary">Add section</button>
    </form>
    <form className="delete-song-form"><input type="hidden" name="song_id" value={song.id} /><ConfirmButton action={deleteSong} message="Delete this song? It cannot be deleted if a service schedule uses it." className="button button-danger"><Trash2 size={15} /> Delete song</ConfirmButton></form>
  </>;
}
