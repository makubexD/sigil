/**
 * Reuses a loaded, validated catalog while nothing under the catalog changed on disk. Every consumer
 * command and wizard action reaches the catalog through `requireValidCatalog`; one wizard session ran
 * it about 130 times on an unchanged catalog, and each run opens and parses every file (on Windows
 * the opens dominate). The check that nothing changed only `lstat`s each entry: its path, size,
 * modified time and file id, so an edit, a new or removed file, or a file swapped for a link all
 * load again. Each caller gets its own `structuredClone`, because callers edit what they get
 * (`move`, `patch`, the gray-matter lesson in frontmatter-parse.ts). A catalog that fails
 * validation is never kept.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import type { LoadedCatalog } from './types';

interface Entry {
  readonly fingerprint: string;
  readonly catalog: LoadedCatalog;
}

/** Catalog directory → the last validated catalog read from it (one per process). */
const cache = new Map<string, Entry>();

/** One line per entry under `dir`, sorted: path, type, size, modified time, file id. */
export function catalogFingerprint(dir: string): string {
  const lines: string[] = [];
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const stat = fs.lstatSync(full, { bigint: true });
      lines.push(
        `${full}\u0000${stat.mode}\u0000${stat.size}\u0000${stat.mtimeNs}\u0000${stat.ino}`,
      );
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(dir);
  return lines.sort().join('\n');
}

/**
 * The validated catalog under `dir`: from the cache while its fingerprint is unchanged, otherwise
 * `loadAndValidate(dir)`, kept only when it returns. Always a fresh copy.
 */
export async function cachedValidCatalog(
  dir: string,
  loadAndValidate: (dir: string) => Promise<LoadedCatalog>,
): Promise<LoadedCatalog> {
  const key = path.resolve(dir);
  const fingerprint = catalogFingerprint(key);
  const hit = cache.get(key);
  if (hit?.fingerprint === fingerprint) return structuredClone(hit.catalog);
  const catalog = await loadAndValidate(dir);
  cache.set(key, { fingerprint, catalog: structuredClone(catalog) });
  return catalog;
}
