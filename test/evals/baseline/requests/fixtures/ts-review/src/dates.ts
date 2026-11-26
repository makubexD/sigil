/** The date as YYYY-MM-DD in UTC. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
