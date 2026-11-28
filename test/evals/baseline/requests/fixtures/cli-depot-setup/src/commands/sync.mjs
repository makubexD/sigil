import { readToken } from '../sync.mjs';

export function syncStatus() {
  console.log(readToken() ? 'sync token: set' : 'sync token: missing');
  return 0;
}
