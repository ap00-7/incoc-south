import { ArrowLeft } from "lucide-react";
import { SongEditorForm } from "@/components/admin/song-creation-form";
import { IntentPrefetchLink } from "@/components/intent-prefetch-link";

export default function NewSongPage() {
  return <>
    <IntentPrefetchLink href="/admin/songs" className="back-link"><ArrowLeft size={15} /> Back to songs</IntentPrefetchLink>
    <p className="eyebrow">ADD TO THE LIBRARY</p>
    <h1>New song</h1>
    <p>Add the song and organize its verses, chorus, and translations before saving.</p>
    <SongEditorForm />
  </>;
}
