export interface OrderRow {
  id: string;
  total: number;
}

/** Writes one order to the warehouse system; rejects when the warehouse refuses it. */
export type SaveOrder = (row: OrderRow) => Promise<void>;

export function isValidRow(row: OrderRow): boolean {
  return row.id !== '' && row.total >= 0;
}
