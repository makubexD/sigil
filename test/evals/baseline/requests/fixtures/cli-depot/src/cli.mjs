import { itemAdd, itemGet, itemList } from './commands/item.mjs';
import { init } from './commands/init.mjs';
import { warehouseShowAll } from './commands/warehouse.mjs';

const HELP = `usage: depot <command> [options]

commands:
  init --name <store> --currency <code>                        create the stock file
  item list                                                    list the items
  item get <id>                                                show one item
  item add --name <name> --qty <n> [--warehouse <name>]        add an item
  warehouse show-all                                           list the warehouses
`;

/** Runs one command line and returns the exit code. */
export async function main(argv) {
  const [group, verb, ...rest] = argv;
  if (!group || group === '--help' || group === '-h') {
    console.log(HELP);
    return 0;
  }
  if (group === 'init') return init(argv.slice(1));
  if (group === 'item' && verb === 'list') return itemList(rest);
  if (group === 'item' && verb === 'get') return itemGet(rest);
  if (group === 'item' && verb === 'add') return itemAdd(rest);
  if (group === 'warehouse' && verb === 'show-all') return warehouseShowAll(rest);
  console.log(`Unknown command: ${argv.join(' ')}`);
  console.log(HELP);
  return 1;
}
