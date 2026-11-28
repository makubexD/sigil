import { parseArgs } from 'node:util';
import { dbPath, load, save } from '../store.mjs';
import { nextId } from '../stock.mjs';

const pad = (text, width) => String(text).padEnd(width);

export function itemList() {
  console.log(`Reading ${dbPath()}...`);
  const { items } = load();
  if (items.length === 0) {
    console.log('No items.');
    return 0;
  }
  console.log(`${pad('ID', 6)}${pad('NAME', 24)}${pad('QTY', 6)}WAREHOUSE`);
  for (const item of items)
    console.log(`${pad(item.id, 6)}${pad(item.name, 24)}${pad(item.qty, 6)}${item.warehouse}`);
  console.log(`${items.length} item(s)`);
  return 0;
}

export function itemGet(argv) {
  const [id] = argv;
  const { items } = load();
  const item = items.find(candidate => candidate.id === id);
  console.log(JSON.stringify(item, null, 2));
  return 0;
}

export function itemAdd(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { name: { type: 'string' }, qty: { type: 'string' }, warehouse: { type: 'string' } },
  });
  const qty = Number(values.qty);
  if (!values.name || !Number.isInteger(qty) || qty < 0) {
    console.error('error: item add needs --name <name> and --qty <a whole number, 0 or more>');
    return 2;
  }
  const db = load();
  const warehouse = values.warehouse ?? db.warehouses[0].name;
  if (!db.warehouses.some(candidate => candidate.name === warehouse)) {
    console.error(`error: no warehouse called "${warehouse}"`);
    return 1;
  }
  const item = { id: nextId(db.items), name: values.name, qty, warehouse };
  db.items.push(item);
  save(db);
  console.log(`Added ${item.id} (${item.name})`);
  return 0;
}
