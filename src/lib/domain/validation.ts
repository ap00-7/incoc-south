export function parseDurationMinutes(value: string): number | null {
  if (value === "") return null;
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error("Duration must be a whole number of minutes.");
  }
  const minutes = Number(value);
  if (!Number.isSafeInteger(minutes) || minutes > 1440) {
    throw new Error("Duration must be between 0 and 1440 minutes.");
  }
  return minutes;
}
