/**
 * Running a consumer command once per catalog its entries were installed from.
 *
 * A manifest records the catalog each entry came from (`src/manifest/catalog-source.ts`), so a
 * command groups the entries, refuses to run when a recorded catalog is gone, and only then loads
 * each catalog and runs its per-catalog logic on that group's entries. Shared by `status` and
 * `prune` so both report the same groups in the same order.
 *
 * @module
 */
import { loadAndValidate } from '../../cli-helpers';
import { assertReachable, groupBySource } from '../../manifest/catalog-source';
import { MANIFEST_RELATIVE_PATH } from '../../manifest/types';
import type {
  CatalogSource,
  CatalogSourceOptions,
  SourceGroup,
} from '../../manifest/catalog-source';
import type { Manifest } from '../../manifest/types';
import type { LoadedCatalog } from '../../types';

/** One group's result, tagged with the source it was judged against (absent = bundled). */
export interface CatalogResult<T> {
  source?: CatalogSource | undefined;
  result: T;
}

/** The manifest view one group's per-catalog logic runs on: only that group's entries. */
function groupView(manifest: Manifest, group: SourceGroup): Manifest {
  return { manifestVersion: manifest.manifestVersion, entries: group.entries };
}

/**
 * Runs `run` once per recorded catalog, in report order (bundled first), each on a view holding
 * only that group's entries. The entry objects are shared with `manifest`, never copied, so a
 * mutation lands in the real manifest. Throws before any catalog is read when a recorded one is
 * missing.
 */
export async function perCatalog<T>(
  manifest: Manifest,
  opts: CatalogSourceOptions,
  run: (catalog: LoadedCatalog, view: Manifest) => T | Promise<T>,
): Promise<CatalogResult<T>[]> {
  const groups = groupBySource(manifest.entries, opts);
  assertReachable(groups, opts.projectDir);
  const results: CatalogResult<T>[] = [];
  for (const group of groups) {
    const { catalog } = await loadAndValidate(group.catalogDir, group.packs);
    results.push({ source: group.source, result: await run(catalog, groupView(manifest, group)) });
  }
  return results;
}

/** The `Using catalog …` line for a group, or `undefined` for the bundled one. */
export function sourceLine(source: CatalogSource | undefined): string | undefined {
  if (source === undefined) return undefined;
  return `Using catalog ${source.dir} (recorded in ${MANIFEST_RELATIVE_PATH})`;
}

/** Prints the `Using catalog …` line for one group, if it has a recorded source. */
export function printSourceLine(source: CatalogSource | undefined): void {
  const line = sourceLine(source);
  if (line !== undefined) console.log(line);
}

/** Prints a `Using catalog …` line for every non-bundled group, before the merged report. */
export function printSourceLines(results: readonly CatalogResult<unknown>[]): void {
  for (const { source } of results) printSourceLine(source);
}
