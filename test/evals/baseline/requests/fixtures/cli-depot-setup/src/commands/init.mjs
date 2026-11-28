import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { dbPath, exists, save } from '../store.mjs';

export const CURRENCIES = ['USD', 'EUR', 'GBP'];

/** Null when the store name is usable, or what is wrong with it. */
export function validateName(name) {
  if (typeof name !== 'string' || name.trim() === '') return 'the store name must not be empty';
  if (name.length > 40) return 'the store name must be 40 characters or fewer';
  return null;
}

/** Null when the currency is one we support, or what is wrong with it. */
export function validateCurrency(currency) {
  return CURRENCIES.includes(currency)
    ? null
    : `the currency must be one of ${CURRENCIES.join(', ')}`;
}

/** Writes a new stock file. Throws when one is already there. */
export function createStore({ name, currency }) {
  if (exists()) throw new Error(`${dbPath()} already exists`);
  save({ store: { name, currency }, warehouses: [{ name: 'main' }], items: [] });
}

/** Asks for whatever the flags left out. */
async function ask(values) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const name = values.name ?? (await rl.question('Store name: '));
    // Written straight away, so a crash further down does not lose the name.
    save({ store: { name, currency: 'USD' }, warehouses: [{ name: 'main' }], items: [] });
    const currency =
      values.currency ?? (await rl.question('Currency (USD, EUR or GBP): ')).toUpperCase();
    const answer = await rl.question(`Create ${dbPath()} for ${name} (${currency})? [y/N] `);
    return { name, currency, confirmed: /^y(es)?$/i.test(answer.trim()) };
  } finally {
    rl.close();
  }
}

export async function init(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { name: { type: 'string' }, currency: { type: 'string' } },
  });
  if (exists()) {
    console.error(`error: ${dbPath()} already exists`);
    return 1;
  }
  if (values.name !== undefined && values.currency !== undefined) {
    const problem = validateName(values.name) ?? validateCurrency(values.currency);
    if (problem) {
      console.error(`error: ${problem}`);
      return 2;
    }
    createStore(values);
    console.log(`Created ${dbPath()} for ${values.name} (${values.currency})`);
    return 0;
  }

  const answers = await ask(values);
  if (!answers.confirmed) {
    console.log('Nothing created.');
    return 1;
  }
  if (!answers.name.trim() || !['USD', 'EUR', 'GBP'].includes(answers.currency)) {
    console.error('error: the store needs a name and a currency of USD, EUR or GBP');
    return 2;
  }
  save({
    store: { name: answers.name, currency: answers.currency },
    warehouses: [{ name: 'main' }],
    items: [],
  });
  console.log(`Created ${dbPath()} for ${answers.name} (${answers.currency})`);
  return 0;
}
