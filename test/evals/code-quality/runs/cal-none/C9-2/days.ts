/**
 * Counts events per local calendar day in the given IANA time zone.
 *
 * Keys are `YYYY-MM-DD`; days without events are absent. Throws a RangeError
 * for an unknown time zone or a timestamp that is not a valid date.
 */
export function countByDay(timestamps: number[], timeZone: string): Record<string, number> {
  // Constructing the formatter validates `timeZone` even when the input is empty.
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const counts: Record<string, number> = {};
  for (const timestamp of timestamps) {
    const key = dayKey(formatter, timestamp);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function dayKey(formatter: Intl.DateTimeFormat, timestamp: number): string {
  let year = '';
  let month = '';
  let day = '';
  for (const part of formatter.formatToParts(timestamp)) {
    if (part.type === 'year') year = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'day') day = part.value;
  }
  return `${year.padStart(4, '0')}-${month}-${day}`;
}
