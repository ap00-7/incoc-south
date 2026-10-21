import { redirect } from "next/navigation";

type Props = { params: Promise<{ scheduleId: string }> };

export default async function ScheduleSlidesRedirect({ params }: Props) {
  const { scheduleId } = await params;
  redirect(`/slides?scheduleId=${encodeURIComponent(scheduleId)}`);
}
