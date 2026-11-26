export interface Row {
  sku: string;
  quantity: number;
}

export function isUsable(row: Row): boolean {
  return row.sku.trim() !== '' && Number.isInteger(row.quantity) && row.quantity > 0;
}
