/** Remembers message ids for `windowMs` so redeliveries inside the window are reported as duplicates. */
export function createDeduper(opts: { windowMs: number; now?: () => number }): {
  isDuplicate(id: string): boolean;
  readonly size: number;
} {
  const { windowMs, now = Date.now } = opts;
  // Insertion order is recording order, so the oldest records are always first.
  const recordedAt = new Map<string, number>();

  const dropExpired = (time: number): void => {
    for (const [id, at] of recordedAt) {
      if (time - at < windowMs) break;
      recordedAt.delete(id);
    }
  };

  return {
    isDuplicate(id: string): boolean {
      const time = now();
      dropExpired(time);
      if (recordedAt.has(id)) return true;
      recordedAt.set(id, time);
      return false;
    },
    get size(): number {
      return recordedAt.size;
    },
  };
}
