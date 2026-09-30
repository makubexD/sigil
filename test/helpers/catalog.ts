/**
 * Shared catalog loader for tests.
 *
 * Memoizes the real loadCatalog + resolveCatalog so the ~40 test bodies that
 * previously repeated `await loadCatalog(CATALOG_DIR); resolveCatalog(...)` each
 * time now parse the on-disk catalog only once per test run.
 *
 * IMPORTANT: the cached result is intentionally module-level so it persists for
 * the lifetime of a single `node --test` invocation. Tests must not mutate the
 * returned catalog; treat it as read-only.
 */
import path from 'path';
import { loadCatalog } from '../../dist-cli/load';
import { resolveCatalog } from '../../dist-cli/resolve';
import type { ResolvedCatalog } from '../../dist-cli/types';

/**
 * Absolute path to the bundled catalog source.
 * From test-compiled/helpers/ we go up two levels to the project root.
 */
export const CATALOG_DIR = path.resolve(__dirname, '../../catalog');

let _resolved: ResolvedCatalog | null = null;

/**
 * Return the resolved catalog, loading and caching it on the first call.
 * Subsequent calls in the same process return the cached object instantly.
 */
export async function loadResolvedCatalog(): Promise<ResolvedCatalog> {
  if (!_resolved) {
    const raw = await loadCatalog(CATALOG_DIR);
    _resolved = resolveCatalog(raw) as ResolvedCatalog;
  }
  return _resolved;
}

/** Clear the memoized catalog (call in afterEach when a test mutates state). */
export function clearCatalogCache(): void {
  _resolved = null;
}
