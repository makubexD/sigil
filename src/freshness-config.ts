/**
 * The config-kind half of freshness: the merge ops the catalog would write today for an installed
 * config artifact, with its recorded install values, and whether they differ from what the manifest
 * recorded. `update` writes with these and `status` reports with them, so the two can't disagree.
 *
 * @module
 */
import { canonicalize } from './config-merge';
import { scaffoldConfigOps } from './config-ops';
import { sameDestination, sameFile } from './manifest';
import { missingVars, usableVars } from './mcp-vars';
import { CONFIG_SCOPES } from './types';
import type { ManifestConfigMerge, ManifestEntry } from './manifest/types';
import type { VarValues } from './mcp-vars';
import type { ConfigMergeOp, ResolvedCatalog, RetiredConfigDestination, Target } from './types';

/** What the config freshness check reads. */
export interface ConfigFreshCtx {
  readonly target: Target;
  readonly resolved: ResolvedCatalog;
  readonly projectDir: string;
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
  vars: VarValues,
): Promise<ConfigMergeOp[]> {
  const { target, resolved } = catalog;
  if (!target.scaffoldConfig) return [];
  const perScope = await Promise.all(
    CONFIG_SCOPES.map(scope =>
      scaffoldConfigOps(target, id, resolved, { projectDir, scope, vars })
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

/** Whether a config entry's recorded fragments changed, and which retired files have no replacement. */
export async function checkConfigEntry(
  entry: ManifestEntry,
  ctx: ConfigFreshCtx,
  retired: readonly RetiredConfigDestination[],
): Promise<{ stale: boolean; unmovable: string[] }> {
  const artifact = ctx.resolved.byId.get(entry.id);
  // The per-scope catch below would swallow the missing-value error and hide the entry as fresh.
  if (artifact !== undefined && missingVars(artifact, usableVars(entry.vars)).length > 0) {
    return { stale: true, unmovable: [] };
  }
  const ops = await catalogConfigOps(entry.id, ctx, ctx.projectDir, usableVars(entry.vars));
  const configFiles = entry.configFiles ?? [];
  const stale = configFiles.some(cf => changedCatalogOp(cf, ops) !== undefined);
  const unmovable = configFiles
    .filter(cf => {
      const move = retired.find(r => sameFile(cf, r.from));
      return move !== undefined && !ops.some(op => sameFile(op, move.to));
    })
    .map(cf => cf.file);
  return { stale, unmovable };
}
