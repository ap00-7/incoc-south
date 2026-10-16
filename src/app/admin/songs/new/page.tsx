import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SongCreationForm } from "@/components/admin/song-creation-form";

export default function NewSongPage() {
  return <>
    <Link href="/admin/songs" className="back-link"><ArrowLeft size={15} /> Back to songs</Link>
    <p className="eyebrow">ADD TO THE LIBRARY</p>
    <h1>New song</h1>
    <p>Add the song and organize its verses, chorus, and translations before saving.</p>
    <SongCreationForm />
  </>;
}
