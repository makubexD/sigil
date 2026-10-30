/**
 * Recording and grouping the catalog an entry was installed from.
 *
 * An entry installed from a non-bundled catalog records `catalog: { dir, packs }`, both relative
 * to the project folder, so `status` / `update` / `prune` can read that catalog instead of
 * reporting the entry orphaned against the bundled one. This module turns the absolute install
 * paths into that record, and groups a manifest's entries into the catalogs they each belong to.
 * Pure apart from `existsSync` in `assertReachable`.
 *
 * @module
 */
import fs from 'fs';
import path from 'path';
import { resolveDefault } from '../cli-helpers';
import { SigilError } from '../errors';
import { MANIFEST_RELATIVE_PATH } from './types';
import type { CatalogSource, ManifestEntry } from './types';

export type { CatalogSource };

/** The catalog options a command runs with; commander fills the bundled defaults. */
export interface CatalogSourceOptions {
  /** The project folder recorded paths are relative to. */
  projectDir: string;
  /** `--catalog-dir`, resolved against the package root when not passed. */
  catalogDir: string;
  /** `--packs`, resolved against the package root when not passed. */
  packs: string;
}

/** Entries to judge against one catalog, with the paths to load it from. */
export interface SourceGroup {
  /** The recorded source, absent for the bundled catalog. */
  source?: CatalogSource | undefined;
  /** Absolute catalog directory to load. */
  catalogDir: string;
  /** Absolute `packs.yaml` to load. */
  packs: string;
  /** The entries recorded against this catalog; shared, never copied. */
  entries: ManifestEntry[];
}

/** `path.relative` with `\` → `/`, so a record is the same on every OS. */
function relativeTo(projectDir: string, target: string): string {
  return path.relative(projectDir, target).replaceAll('\\', '/');
}

/**
 * The `catalog` record for an install, or `undefined` for the bundled catalog.
 * `catalogDir` and `packs` are absolute; the record is relative to `projectDir`.
 */
export function sourceToRecord(
  projectDir: string,
  catalogDir: string,
  packs: string,
): CatalogSource | undefined {
  if (path.resolve(catalogDir) === path.resolve(resolveDefault('catalog'))) return undefined;
  return { dir: relativeTo(projectDir, catalogDir), packs: relativeTo(projectDir, packs) };
}

/**
 * True when `--catalog-dir` names something other than the bundled catalog. Commander fills the
 * default, so "explicit" means "differs from it"; passing the bundled path is the same as passing
 * nothing.
 */
export function isExplicitCatalog(opts: Pick<CatalogSourceOptions, 'catalogDir'>): boolean {
  return path.resolve(opts.catalogDir) !== path.resolve(resolveDefault('catalog'));
}

/**
 * The groups to run a command against, in report order: the bundled group first, then one group
 * per recorded source sorted by `dir`. An explicit `--catalog-dir` wins and judges every entry
 * against it, as it did before sources were recorded. Paths of recorded groups are resolved
 * against `opts.projectDir`.
 */
export function groupBySource(
  entries: readonly ManifestEntry[],
  opts: CatalogSourceOptions,
): SourceGroup[] {
  if (isExplicitCatalog(opts)) return [catalogGroup([...entries], opts)];

  const { bundled, recorded } = partitionBySource(entries);
  // With nothing recorded at all, an empty manifest still yields the bundled group.
  const first = bundled.length > 0 || recorded.size === 0 ? [catalogGroup(bundled, opts)] : [];
  return [...first, ...recordedGroups(recorded, opts.projectDir)];
}

/** A group read from `opts`'s catalog: the bundled one, or the explicit `--catalog-dir`. */
function catalogGroup(entries: ManifestEntry[], opts: CatalogSourceOptions): SourceGroup {
  return { source: undefined, catalogDir: opts.catalogDir, packs: opts.packs, entries };
}

/** Splits entries into the unrecorded (bundled) ones and one bucket per recorded source. */
function partitionBySource(entries: readonly ManifestEntry[]): {
  bundled: ManifestEntry[];
  recorded: Map<string, { source: CatalogSource; entries: ManifestEntry[] }>;
} {
  const bundled: ManifestEntry[] = [];
  const recorded = new Map<string, { source: CatalogSource; entries: ManifestEntry[] }>();
  for (const entry of entries) {
    const source = recordedSource(entry);
    if (source === undefined) {
      bundled.push(entry);
      continue;
    }
    const key = `${source.dir}\0${source.packs}`;
    const group = recorded.get(key);
    if (group === undefined) recorded.set(key, { source, entries: [entry] });
    else group.entries.push(entry);
  }
  return { bundled, recorded };
}

/**
 * The entry's recorded catalog, checked: the manifest is a hand-editable committed file, and this
 * value decides which folder a command reads. Anything but `{ dir: string, packs: string }` throws.
 */
function recordedSource(entry: ManifestEntry): CatalogSource | undefined {
  const source: unknown = entry.catalog;
  if (source === undefined) return undefined;
  const { dir, packs } = (source ?? {}) as Partial<Record<keyof CatalogSource, unknown>>;
  if (typeof dir === 'string' && dir !== '' && typeof packs === 'string' && packs !== '') {
    return { dir, packs };
  }
  throw new SigilError(
    `The catalog recorded in ${MANIFEST_RELATIVE_PATH} for '${entry.id}' is not { "dir": "<path>", "packs": "<path>" }.`,
    { hint: 'Fix or remove its "catalog" field, or pass --catalog-dir <path>.' },
  );
}

/** One group per recorded source, sorted by `dir`, its paths resolved against `projectDir`. */
function recordedGroups(
  recorded: Map<string, { source: CatalogSource; entries: ManifestEntry[] }>,
  projectDir: string,
): SourceGroup[] {
  return [...recorded.values()]
    .sort((a, b) => a.source.dir.localeCompare(b.source.dir))
    .map(({ source, entries }) => ({
      source,
      catalogDir: path.resolve(projectDir, source.dir),
      packs: path.resolve(projectDir, source.packs),
      entries,
    }));
}

/**
 * Throws when a recorded catalog no longer exists, before anything is read or written. An entry
 * from a missing catalog is a reachability error, never reported as orphaned.
 */
export function assertReachable(groups: readonly SourceGroup[], projectDir: string): void {
  for (const group of groups) {
    if (group.source === undefined) continue;
    if (fs.existsSync(path.resolve(projectDir, group.source.dir))) continue;
    const count = group.entries.length;
    throw new SigilError(
      `Catalog '${group.source.dir}' recorded in ${MANIFEST_RELATIVE_PATH} for ${count} artifact${
        count === 1 ? '' : 's'
      } was not found.`,
      { hint: 'Restore it or pass --catalog-dir <path>.' },
    );
  }
}
