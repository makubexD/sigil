/**
 * Whether `sigil update` would rewrite an installed artifact from today's catalog. `update` writes
 * through these functions, and `status` and the install states (`add`, the wizard) report
 * `outdated` through {@link isStale}, so no view can call an artifact up to date that `update`
 * would rewrite, or the reverse (docs/audits/2026-10-16/results.md, row 13).
 *
 * @module
 */
import { canonicalize } from './config-merge';
import { isConfigKind } from './kinds';
import { sameDestination, sha256 } from './manifest';
import { CONFIG_SCOPES } from './types';
import type { Manifest, ManifestConfigMerge, ManifestEntry } from './manifest/types';
import type { ConfigMergeOp, ResolvedCatalog, Target } from './types';

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

/**
 * The catalog's current merge ops for a config artifact, across every scope. The manifest records
 * a fragment's destination (file + root), not the scope that chose it, so update scaffolds all
 * scopes and matches each recorded fragment to its destination's op.
 */
export async function catalogConfigOps(
  id: string,
  catalog: { target: Target; resolved: ResolvedCatalog },
  projectDir: string,
): Promise<ConfigMergeOp[]> {
  const { target, resolved } = catalog;
  if (!target.scaffoldConfig) return [];
  const perScope = await Promise.all(
    CONFIG_SCOPES.map(scope =>
      target.scaffoldConfig!(id, resolved, { projectDir, scope })
        // A scope this target can't scaffold has no fresh op; its recorded fragment is restored.
        .catch((): ConfigMergeOp[] => []),
    ),
  );
  return perScope.flat();
}

/** The catalog's current op for `cf`'s destination, when it differs from what was recorded. */
export function changedCatalogOp(
  cf: ManifestConfigMerge,
  freshOps: readonly ConfigMergeOp[],
): ConfigMergeOp | undefined {
  const fresh = freshOps.find(op => sameDestination(cf, op));
  if (!fresh) return undefined;
  const same = (op: { fragment: Record<string, unknown>; strategy: Record<string, unknown> }) =>
    canonicalize(op.fragment) + canonicalize(op.strategy);
  return same(fresh) === same(cf) ? undefined : fresh;
}

/** True when writing `fresh` would change or add a file, or retire one `update` would delete. */
function wholeFileChanged(entry: ManifestEntry, fresh: Record<string, string>): boolean {
  const recorded = new Map(entry.files.map(f => [f.path, f.sha256]));
  const changed = Object.entries(fresh).some(([p, text]) => recorded.get(p) !== sha256(text));
  return changed || entry.files.some(f => !(f.path in fresh));
}

/**
 * Whether `update` would rewrite `entry` from the catalog. Local edits and deletions are not
 * staleness: every view reports those as drifted or missing first. A render that fails counts as
 * not stale, as `update` writes nothing for it either.
 */
export async function isStale(entry: ManifestEntry, ctx: FreshRenderCtx): Promise<boolean> {
  try {
    if (isConfigKind(entry.kind) && (entry.configFiles?.length ?? 0) > 0) {
      const ops = await catalogConfigOps(entry.id, ctx, ctx.projectDir);
      return (entry.configFiles ?? []).some(cf => changedCatalogOp(cf, ops) !== undefined);
    }
    return wholeFileChanged(entry, await renderFresh(entry.id, ctx));
  } catch {
    return false;
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
}

/**
 * The {@link entryKey}s of the `manifest` entries `update` would rewrite. Each target renders with
 * its own installed set, the one `update --target` uses.
 */
export async function staleEntries(manifest: Manifest, scan: StaleScan): Promise<Set<string>> {
  const stale = new Set<string>();
  for (const name of new Set(manifest.entries.map(e => e.target))) {
    const target = scan.targetOf(name);
    if (!target?.scaffold) continue;
    const entries = manifest.entries.filter(e => e.target === name);
    const ctx: FreshRenderCtx = {
      target,
      resolved: scan.resolved,
      projectDir: scan.projectDir,
      installedIds: new Set(entries.map(e => e.id)),
    };
    const checked = entries.filter(
      e => scan.resolved.byId.has(e.id) && !scan.refused?.has(e.id) && (scan.only?.(e) ?? true),
    );
    for (const entry of checked) if (await isStale(entry, ctx)) stale.add(entryKey(entry));
  }
  return stale;
}
