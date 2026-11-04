/**
 * Whether `sigil update` would rewrite an installed artifact from today's catalog. `update` writes
 * through these functions, and `status` and the install states (`add`, the wizard) report
 * `outdated` through {@link staleEntries}, so no view can call an artifact up to date that `update`
 * would rewrite, or the reverse (docs/audits/2026-10-16/results.md, row 13). A scan also reports
 * renders that failed, retired files the catalog no longer replaces, and new dependencies `update`
 * would install.
 *
 * @module
 */
import { checkConfigEntry } from './freshness-config';
import { isConfigKind } from './kinds';
import { sha256 } from './manifest';
import { computeClosure } from './select/closure';
import type { Manifest, ManifestEntry } from './manifest/types';
import type { ResolvedCatalog, RetiredConfigDestination, Target } from './types';

/** A dependency to install, and the installed artifacts that use it. */
export interface MissingDependency {
  readonly id: string;
  readonly via: readonly string[];
}

/**
 * Dependencies (`uses`) of `updatedIds` not in `present`: what is installed for the target, plus
 * whatever an enabled plugin of it delivers.
 */
export function missingDependencies(
  updatedIds: readonly string[],
  resolved: ResolvedCatalog,
  target: Target,
  present: ReadonlySet<string>,
): MissingDependency[] {
  const known = updatedIds.filter(id => resolved.byId.has(id));
  return computeClosure(known, resolved, target)
    .dependencies.filter(dep => !present.has(dep.artifact.id))
    .map(dep => ({ id: dep.artifact.id, via: dep.via }));
}

/** What a fresh render needs: the catalog after project overlays, and what is installed. */
export interface FreshRenderCtx {
  target: Target;
  /** The resolved catalog with `.sigil/overlays.yaml` applied, as `add` and `update` use it. */
  resolved: ResolvedCatalog;
  projectDir: string;
  /**
   * Every artifact id installed for this target. A Boundary section lists only related artifacts
   * installed alongside, so a render without this set differs from the file `add` wrote.
   */
  installedIds?: ReadonlySet<string> | undefined;
}

/** The files `update` would write for whole-file artifact `id`, keyed by project-relative path. */
export function renderFresh(id: string, ctx: FreshRenderCtx): Promise<Record<string, string>> {
  if (!ctx.target.scaffold) {
    return Promise.reject(new Error(`target '${ctx.target.name}' cannot scaffold files`));
  }
  return ctx.target.scaffold(id, ctx.resolved, {
    projectDir: ctx.projectDir,
    overwrite: true,
    includeDeps: false,
    ...(ctx.installedIds ? { coInstallSet: new Set(ctx.installedIds) } : {}),
  });
}

/** True when writing `fresh` would change or add a file, or retire one `update` would delete. */
function wholeFileChanged(entry: ManifestEntry, fresh: Record<string, string>): boolean {
  const recorded = new Map(entry.files.map(f => [f.path, f.sha256]));
  const changed = Object.entries(fresh).some(([p, text]) => recorded.get(p) !== sha256(text));
  return changed || entry.files.some(f => !(f.path in fresh));
}

type EntryCheck = { stale: boolean; unmovable: string[] } | { error: string };

/**
 * Whether `update` would rewrite `entry` from the catalog, and which of its retired config files
 * the catalog no longer replaces. Local edits and deletions are not staleness: every view reports
 * those as drifted or missing first. A render that fails reports its error (update writes nothing
 * for it, so it is not stale); `unmovable` lists retired files the catalog no longer replaces
 * (update cannot move them).
 */
async function checkEntry(
  entry: ManifestEntry,
  ctx: FreshRenderCtx,
  retired: readonly RetiredConfigDestination[],
): Promise<EntryCheck> {
  try {
    if (isConfigKind(entry.kind) && (entry.configFiles?.length ?? 0) > 0) {
      return await checkConfigEntry(entry, ctx, retired);
    }
    return { stale: wholeFileChanged(entry, await renderFresh(entry.id, ctx)), unmovable: [] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Identity of a manifest entry: one id can be installed for several targets. */
export function entryKey(entry: Pick<ManifestEntry, 'id' | 'target'>): string {
  return `${entry.target}\0${entry.id}`;
}

/** Which of `manifest`'s entries to check, and how; see {@link staleEntries}. */
export interface StaleScan {
  resolved: ResolvedCatalog;
  projectDir: string;
  targetOf: (name: string) => Target | undefined;
  /** Rule ids whose overlay was refused: `update` leaves them as installed, so they are skipped. */
  refused?: ReadonlyMap<string, string> | undefined;
  /** Only these entries; all of them when absent. */
  only?: (entry: ManifestEntry) => boolean;
  /** The retired config destinations of a target; nothing is unmovable when absent. */
  retiredFor?: ((target: string) => readonly RetiredConfigDestination[]) | undefined;
  /** Ids an enabled plugin of that target delivers; a dependency in it is never new. */
  deliveredFor?: ((target: Target) => ReadonlySet<string>) | undefined;
}

/** What one scan found; every key is an {@link entryKey}. */
export interface Freshness {
  /** Entries `update` would rewrite. */
  readonly stale: ReadonlySet<string>;
  /** Entries whose render threw, with the message. */
  readonly failed: ReadonlyMap<string, string>;
  /** Config entries' retired files the catalog no longer replaces. */
  readonly unmovable: ReadonlyMap<string, readonly string[]>;
  /** Dependencies `update` would install, keyed by the installed artifact that uses them. */
  readonly newDependencies: ReadonlyMap<string, readonly string[]>;
}

/**
 * The `computeStatus` hooks a scan answers: whether `update` would rewrite an entry, and whether it
 * can move the entry's record out of a retired file.
 */
export function statusHooks(fresh: Freshness): {
  isStale: (entry: ManifestEntry) => boolean;
  canMove: (entry: ManifestEntry, file: string) => boolean;
} {
  return {
    isStale: entry => fresh.stale.has(entryKey(entry)),
    canMove: (entry, file) => !fresh.unmovable.get(entryKey(entry))?.includes(file),
  };
}

interface ScanFound {
  stale: Set<string>;
  failed: Map<string, string>;
  unmovable: Map<string, readonly string[]>;
  newDependencies: Map<string, readonly string[]>;
}

/** The entries of one target that `update` would check: in the catalog, not refused, selected. */
function checkedEntries(entries: readonly ManifestEntry[], scan: StaleScan): ManifestEntry[] {
  return entries.filter(
    e => scan.resolved.byId.has(e.id) && !scan.refused?.has(e.id) && (scan.only?.(e) ?? true),
  );
}

async function scanEntries(
  checked: readonly ManifestEntry[],
  ctx: FreshRenderCtx,
  retired: readonly RetiredConfigDestination[],
  found: ScanFound,
): Promise<void> {
  for (const entry of checked) {
    const r = await checkEntry(entry, ctx, retired);
    const key = entryKey(entry);
    if ('error' in r) found.failed.set(key, r.error);
    else {
      if (r.stale) found.stale.add(key);
      if (r.unmovable.length > 0) found.unmovable.set(key, r.unmovable);
    }
  }
}

function recordNewDependencies(
  checked: readonly ManifestEntry[],
  ctx: FreshRenderCtx,
  delivered: Iterable<string> = [],
  found: ScanFound,
): void {
  const ids = checked.map(e => e.id);
  const present = new Set([...(ctx.installedIds ?? []), ...delivered]);
  for (const { id, via } of missingDependencies(ids, ctx.resolved, ctx.target, present)) {
    for (const v of via) {
      const k = entryKey({ target: ctx.target.name, id: v });
      found.newDependencies.set(k, [...(found.newDependencies.get(k) ?? []), id]);
    }
  }
}

async function scanTarget(
  name: string,
  manifest: Manifest,
  scan: StaleScan,
  found: ScanFound,
): Promise<void> {
  const target = scan.targetOf(name);
  if (!target?.scaffold) return;
  const entries = manifest.entries.filter(e => e.target === name);
  const ctx: FreshRenderCtx = {
    target,
    resolved: scan.resolved,
    projectDir: scan.projectDir,
    installedIds: new Set(entries.map(e => e.id)),
  };
  const checked = checkedEntries(entries, scan);
  await scanEntries(checked, ctx, scan.retiredFor?.(name) ?? [], found);
  recordNewDependencies(checked, ctx, scan.deliveredFor?.(target), found);
}

/**
 * What `update` would change for `manifest`: the {@link entryKey}s it would rewrite, the renders
 * that failed, the retired config files it cannot move, and the dependencies it would install.
 * Each target renders with its own installed set, the one `update --target` uses.
 */
export async function staleEntries(manifest: Manifest, scan: StaleScan): Promise<Freshness> {
  const found: ScanFound = {
    stale: new Set<string>(),
    failed: new Map<string, string>(),
    unmovable: new Map<string, readonly string[]>(),
    newDependencies: new Map<string, readonly string[]>(),
  };
  for (const name of new Set(manifest.entries.map(e => e.target))) {
    await scanTarget(name, manifest, scan, found);
  }
  return found;
}
