/**
 * Small path-string helpers shared across commands/, authoring/, and targets/.
 *
 * Both idioms below were previously re-declared inline at 7+ call sites (two
 * different spellings for the id→basename case) instead of living in one place.
 *
 * @module
 */

/** Normalizes Windows backslashes to forward slashes, for cross-platform path comparison. */
export function normPath(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Returns the last `/`-separated segment of a catalog id (e.g. 'shared/clean-code' → 'clean-code'). */
export function basenameOfId(id: string): string {
  return id.split('/').pop() ?? id;
}
