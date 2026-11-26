export interface Item {
  sku: string;
  stock: number;
}

/** Pushes one item's stock level to the storefront. */
export type Push = (item: Item) => Promise<void>;

export function describe(item: Item): string {
  console.log('describing', item.sku);
  return `${item.sku}: ${item.stock} in stock`;
}

export function lowStock(items: Item[]): Item[] {
  const low = items.filter(item => item.stock < 5);
  console.log(`low stock: ${low.length}`);
  return low;
}
