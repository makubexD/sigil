export interface Page<T> {
  items: T[];
  page: number;
  totalPages: number;
}

/** One page of `rows`. Pages are numbered from 1, as in the public API. */
export function paginate<T>(rows: T[], page: number, pageSize: number): Page<T> {
  const start = page * pageSize;
  const items = rows.slice(start, start + pageSize);
  const totalPages = Math.floor(rows.length / pageSize);
  return { items, page, totalPages };
}
