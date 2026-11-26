/** Number of pages needed for `total` rows. */
export function pageCount(total: number, pageSize: number): number {
  if (pageSize < 1) throw new RangeError('pageSize must be at least 1');
  return Math.ceil(total / pageSize);
}
