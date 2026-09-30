/**
 * `sigil update` for a config fragment the catalog has changed since install: reverse the
 * recorded fragment, merge the catalog's current one, and rewrite the manifest record
 * (docs/reference/config-kinds.md, "Re-install and catalog changes replace, never stack").
 *
 * @module
 */
import { canonicalize, classifyConfigDrift } from '../config-merge';
import { sameDestination, sha256 } from '../manifest';
import type { ManifestEntry, ManifestConfigMerge } from '../manifest/types';
import { CONFIG_SCOPES } from '../types';
import type { ConfigMergeOp, ResolvedCatalog, Target } from '../types';
import type { UpdateOptions } from './update';
import {
  readExistingOrWarn,
  resolveConfigFileTarget,
  writeMergedConfigFile,
} from './update-config-io';

/**
 * The catalog's current fragment differs from the recorded one: reverse the recorded fragment
 * and merge the new one, then record it. An object-spread value the user changed still needs
 * `--force`; array fragments can't be "modified" (drift.ts), and replaceMerge only removes
 * items that are still exactly as sigil wrote them, so a user's edited copy stays in place.
 */
export function applyCatalogChange(
  cf: ManifestConfigMerge,
  fresh: ConfigMergeOp,
  entry: ManifestEntry,
  opts: UpdateOptions,
): boolean {
  const { fullPath, op: previous } = resolveConfigFileTarget(cf, opts.projectDir);
  const existing = readExistingOrWarn(fullPath, entry.id, cf.file);
  if (existing === undefined) return false;
  const gate = catalogChangeGate(existing, previous, opts);
  if (gate !== 'write') {
    console.log(`  ${GATE_NOTE[gate]}  ${entry.id}\n     ${cf.file}`);
    return gate === 'dry-run';
  }
  writeMergedConfigFile(fullPath, existing, { previous, next: fresh });
  recordFragment(cf, fresh);
  console.log(`  ✓  ${entry.id}  (${cf.file} updated from the catalog)`);
  return true;
}

const GATE_NOTE = {
  blocked: "⊘  (catalog changed, but sigil's values were edited — use --force)",
  'dry-run': '↑  (would be updated from the catalog)',
} as const;

/** Whether a catalog change may be written: an edited object-spread value needs --force. */
function catalogChangeGate(
  existing: Record<string, unknown>,
  previous: ConfigMergeOp,
  opts: UpdateOptions,
): 'blocked' | 'dry-run' | 'write' {
  if (classifyConfigDrift(existing, previous) === 'modified' && !opts.force) return 'blocked';
  return opts.dryRun ? 'dry-run' : 'write';
}

/** Rewrites a manifest record to describe `op`'s fragment (saved with the manifest afterwards). */
function recordFragment(cf: ManifestConfigMerge, op: ConfigMergeOp): void {
  cf.fragment = op.fragment;
  cf.strategy = op.strategy as Record<string, string>;
  cf.fragmentSha256 = sha256(canonicalize(op.fragment));
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
