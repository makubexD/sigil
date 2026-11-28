import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Cloud backup. The token comes from DEPOT_SYNC_TOKEN, or from the credentials file a setup wrote.

/** Where the saved token is: DEPOT_CREDENTIALS, or .depot-credentials in the current folder. */
export const credentialsPath = () =>
  process.env.DEPOT_CREDENTIALS ?? path.resolve('.depot-credentials');

export function saveToken(token) {
  writeFileSync(credentialsPath(), token + '\n', { mode: 0o600 });
}

export function readToken() {
  if (process.env.DEPOT_SYNC_TOKEN) return process.env.DEPOT_SYNC_TOKEN;
  return existsSync(credentialsPath()) ? readFileSync(credentialsPath(), 'utf8').trim() : null;
}
