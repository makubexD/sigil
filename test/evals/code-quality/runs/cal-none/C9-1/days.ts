/**
 * Counts events per calendar day in the given IANA time zone.
 *
 * @param timestamps Milliseconds since the Unix epoch, in any order.
 * @param timeZone IANA time zone name, e.g. `America/New_York`.
 * @returns Map of `YYYY-MM-DD` (local day in `timeZone`) to event count.
 * @throws RangeError if `timeZone` is not a valid time zone or a timestamp is not a valid date.
 */
export function countByDay(timestamps: number[], timeZone: string): Record<string, number> {
  // Constructed up front so an invalid time zone throws even for empty input.
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const counts: Record<string, number> = {};
  for (const ts of timestamps) {
    const key = dayKey(formatter, ts);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function dayKey(formatter: Intl.DateTimeFormat, ts: number): string {
  let year = '';
  let month = '';
  let day = '';
  for (const part of formatter.formatToParts(ts)) {
    if (part.type === 'year') year = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'day') day = part.value;
  }
  return `${year.padStart(4, '0')}-${month}-${day}`;
}
