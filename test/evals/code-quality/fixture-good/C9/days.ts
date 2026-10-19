/** Counts events per local calendar day (`YYYY-MM-DD`) in the IANA time zone `timeZone`. */
export function countByDay(timestamps: number[], timeZone: string): Record<string, number> {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const localDay = (time: number): string => {
    const parts: Record<string, string> = {};
    for (const { type, value } of format.formatToParts(time)) parts[type] = value;
    return `${parts.year}-${parts.month}-${parts.day}`;
  };

  const counts: Record<string, number> = {};
  for (const time of timestamps) {
    const day = localDay(time);
    counts[day] = (counts[day] ?? 0) + 1;
  }
  return counts;
}
