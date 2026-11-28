/** Items a warehouse holds. */
export const inWarehouse = (items, warehouse) => items.filter(item => item.warehouse === warehouse);

/** The next free item id: i1, i2, ... */
export function nextId(items) {
  const used = items.map(item => Number(item.id.slice(1)));
  return `i${Math.max(0, ...used) + 1}`;
}
