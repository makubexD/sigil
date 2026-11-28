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

export function init(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { name: { type: 'string' }, currency: { type: 'string' } },
  });
  const problem =
    values.name === undefined || values.currency === undefined
      ? 'init needs --name <store> and --currency <code>'
      : (validateName(values.name) ?? validateCurrency(values.currency));
  if (problem) {
    console.error(`error: ${problem}`);
    return 2;
  }
  try {
    createStore(values);
  } catch (error) {
    console.error(`error: ${error.message}`);
    return 1;
  }
  console.log(`Created ${dbPath()} for ${values.name} (${values.currency})`);
  return 0;
}
