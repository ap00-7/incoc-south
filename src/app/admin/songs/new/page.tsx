import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSong } from "@/app/admin/actions";

export default function NewSongPage() {
  return <>
    <Link href="/admin/songs" className="back-link"><ArrowLeft size={15} /> Back to songs</Link>
    <p className="eyebrow">ADD TO THE LIBRARY</p>
    <h1>New song</h1>
    <p>Start with a lyric section. You can add more sections after saving.</p>
    <form className="form-stack admin-form" action={createSong} data-dirty-form>
      <label htmlFor="title">Song title</label><input id="title" name="title" required maxLength={200} />
      <label htmlFor="language">Language</label><input id="language" name="language" required maxLength={80} placeholder="e.g. English, தமிழ், తెలుగు" />
      <label htmlFor="author">Author <span className="muted">(optional)</span></label><input id="author" name="author" maxLength={200} />
      <label htmlFor="source">Source <span className="muted">(optional)</span></label><input id="source" name="source" maxLength={300} />
      <label htmlFor="section_type">First section</label>
      <select id="section_type" name="section_type" defaultValue="verse"><option value="verse">Verse</option><option value="chorus">Chorus</option><option value="pre_chorus">Pre-chorus</option><option value="bridge">Bridge</option><option value="intro">Intro</option><option value="outro">Outro</option><option value="other">Other</option></select>
      <label htmlFor="section_label">Section label <span className="muted">(optional)</span></label><input id="section_label" name="section_label" maxLength={100} placeholder="e.g. Verse 1" />
      <label htmlFor="lyrics">Lyrics</label><textarea id="lyrics" name="lyrics" required maxLength={20000} rows={8} placeholder="Keep line breaks as they should appear in the song." />
      <button className="button button-primary">Save song</button>
    </form>
  </>;
}
