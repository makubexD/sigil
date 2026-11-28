import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Where the stock file is: DEPOT_DB, or depot.json in the current folder. */
export const dbPath = () => process.env.DEPOT_DB ?? path.resolve('depot.json');

export const exists = () => existsSync(dbPath());

export function load() {
  const file = dbPath();
  if (!existsSync(file)) throw new Error(`no stock file at ${file}; run "depot init" first`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function save(db) {
  writeFileSync(dbPath(), JSON.stringify(db, null, 2) + '\n');
}
