import { load } from '../store.mjs';

export function warehouseShowAll() {
  for (const warehouse of load().warehouses) console.log(warehouse.name);
  return 0;
}
