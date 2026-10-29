export function formatScheduleDuration(minutes: number | null) {
  if (minutes == null || minutes <= 0) return null;
  return `${minutes} ${minutes === 1 ? "min" : "mins"}`;
}
