import { redirect } from "next/navigation";

export default async function LegacySongPage({ params }: { params: Promise<{ songId: string }> }) {
  const { songId } = await params;
  redirect(`/song/${songId}`);
}
