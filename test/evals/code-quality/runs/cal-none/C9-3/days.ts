/**
 * Counts events per local calendar day in the given IANA time zone.
 *
 * Keys are `YYYY-MM-DD` dates in `timeZone`; days without events are absent.
 * Throws a RangeError for an invalid time zone or a non-finite timestamp.
 */
export function countByDay(timestamps: number[], timeZone: string): Record<string, number> {
  // Pin the calendar and digits so the output doesn't depend on the host locale.
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const counts: Record<string, number> = {};
  for (const ts of timestamps) {
    const key = dayKey(format, ts);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function dayKey(format: Intl.DateTimeFormat, ts: number): string {
  let year = '';
  let month = '';
  let day = '';
  for (const part of format.formatToParts(ts)) {
    if (part.type === 'year') year = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'day') day = part.value;
  }
  return `${year.padStart(4, '0')}-${month}-${day}`;
}
