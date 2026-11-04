/**
 * `sigil update`: one config-kind entry. It reads the entry's recorded install values over any
 * given on the run, moves a fragment off a retired file, merges the catalog's current op, and
 * records the values it wrote with. `update` never prompts: an entry missing a value stays as
 * installed, and the reason names the flag to re-run with.
 *
 * @module
 */
import { catalogConfigOps, changedCatalogOp } from '../freshness-config';
import { isAtRetiredDestination } from '../manifest';
import { declaredVarNames, missingVars, usableVars } from '../mcp-vars';
import { applyConfigEntry } from './update-config';
import { moveRetiredFragments } from './update-config-move';
import type { ManifestEntry } from '../manifest/types';
import type { VarValues } from '../mcp-vars';
import type { ResolvedArtifact, ResolvedCatalog, Target } from '../types';
import type { WrittenConfig } from './add/execute-config';
import type { ConfigUpdateOptions } from './update';

export interface EntryUpdateOutcome {
  updated: boolean;
  pending?: boolean;
  skippedDriftCount: number;
  orphaned: boolean;
}

/** Shared context for the update-run helpers below. */
export interface UpdateRunCtx {
  catalogIds: Set<string>;
  resolved: ResolvedCatalog;
  target: Target;
  opts: ConfigUpdateOptions;
  /** Config artifacts this run wrote, for the one MCP env warning at the end. */
  written: WrittenConfig[];
}

/**
 * Why update keeps `entry` as installed: the target's reason first, then the install values it
 * lacks (`update` never prompts, so it names the flag to re-run with).
 */
function skipReasonFor(
  artifact: ResolvedArtifact | undefined,
  target: Target,
  missing: readonly string[],
): string | undefined {
  const targetReason = artifact && target.configSkipReason?.(artifact);
  if (targetReason) return targetReason;
  if (missing.length === 0) return undefined;
  const flags = missing.map(name => `--var ${name}=<value>`).join(', ');
  return `needs ${missing.join(', ')}; re-run with ${flags}`;
}

/** Records the artifact's declared values from `values` on `entry`, dropping the key when empty. */
function recordVars(entry: ManifestEntry, artifact: ResolvedArtifact, values: VarValues): void {
  const recorded = Object.fromEntries(
    declaredVarNames(artifact)
      .filter(name => Object.hasOwn(values, name))
      .map(name => [name, values[name] as string]),
  );
  if (Object.keys(recorded).length === 0) delete entry.vars;
  else entry.vars = recorded;
}

/** The entry's install values, the catalog's current ops, and any value it still lacks. */
async function configRun(entry: ManifestEntry, ctx: UpdateRunCtx) {
  const { opts } = ctx;
  const artifact = ctx.resolved.byId.get(entry.id);
  const values = { ...usableVars(entry.vars), ...opts.vars };
  const missing = artifact ? missingVars(artifact, values) : [];
  const freshOps =
    missing.length > 0 ? [] : await catalogConfigOps(entry.id, ctx, opts.projectDir, values);
  return { opts, artifact, values, missing, freshOps };
}

type ConfigRun = Awaited<ReturnType<typeof configRun>>;

/**
 * After the merge: reports what was written and records the values. A file that already holds them
 * still needs the record, or `status` calls the entry outdated forever. A file that kept something
 * else, such as a user's edit, doesn't get a value it doesn't hold.
 */
function recordOutcome(
  entry: ManifestEntry,
  ctx: UpdateRunCtx,
  run: ConfigRun,
  wrote: boolean,
): void {
  const { opts, artifact, values, missing, freshOps } = run;
  if (opts.dryRun || !artifact) return;
  if (wrote) ctx.written.push({ id: entry.id, artifact });
  const configFiles = entry.configFiles ?? [];
  const holdsValues =
    missing.length === 0 && !configFiles.some(cf => changedCatalogOp(cf, freshOps) !== undefined);
  if (wrote || holdsValues) recordVars(entry, artifact, values);
}

/** Brings a config-kind entry (hook/settings/mcp) up to date. */
export async function updateConfigOutcome(
  entry: ManifestEntry,
  ctx: UpdateRunCtx,
): Promise<EntryUpdateOutcome> {
  const run = await configRun(entry, ctx);
  const { opts, artifact, missing, freshOps } = run;
  const retired = ctx.target.retiredConfigDestinations ?? [];
  const moved = moveRetiredFragments(entry, opts, freshOps, retired);
  const applied = applyConfigEntry(entry, opts, freshOps, {
    isRetired: cf => isAtRetiredDestination(cf, retired),
    skipReason: skipReasonFor(artifact, ctx.target, missing),
  });
  const wrote = moved.wrote || applied.wrote;
  recordOutcome(entry, ctx, run, wrote);
  const skippedDriftCount = moved.skipped + applied.skipped;
  return { updated: wrote, pending: wrote && !!opts.dryRun, skippedDriftCount, orphaned: false };
}
