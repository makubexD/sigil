/**
 * `sigil update [ids...]` command — refresh installed artifacts to the current catalog version.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * DRY fix: replaces 7 inline `require('fs'/'path')` calls with top-level node:fs / node:path
 * imports (the modules were already imported in cli.ts; the require() calls were a mistake).
 * The file-drift detection is extracted into `isFileDrifted` — a pure, testable helper.
 *
 * The run itself happens once per catalog the manifest records (`./update-groups.ts`); this module
 * builds the setup, then saves the manifest and prints the merged summary once.
 *
 * @module
 */
import { detectProjectTarget } from '../cli-helpers';
import { getTarget } from '../targets';
import { recordedOpsAt, saveManifest } from '../manifest';
import { assertReachable, groupBySource } from '../manifest/catalog-source';
import { requireManifest } from './shared/manifest';
import { SigilError } from '../errors';
import { runGuidedUpdate, shouldGuideUpdate } from './update-guided';
import { filterEntriesToUpdate, printNoEntriesMessage } from './update-entries';
import { finishEachGroup, loadUpdateGroups, updateEachGroup } from './update-groups';
import type { UpdateGroup } from './update-groups';
import { warnMcpEnvCaveats } from './add/execute-config';
import type { WrittenConfig } from './add/execute-config';
import type { Manifest } from '../manifest/types';
import type { Target } from '../types';
import type { SigilOpsAt } from './update-config-io';

export { isFileDrifted } from './update-wholefile';

export interface UpdateOptions {
  projectDir: string;
  target?: string | undefined;
  catalogDir: string;
  packs: string;
  force: boolean;
  dryRun: boolean;
  /** Skip the terminal preview-and-confirm. Has no effect outside a terminal, which never asks. */
  yes?: boolean | undefined;
  /**
   * Every artifact id installed for this target — set by runUpdate from the manifest, not a CLI
   * flag. Re-rendering needs it for the same reason `add` passes its install set: a Boundary
   * section lists only related artifacts that are installed alongside.
   */
  installedIds?: ReadonlySet<string> | undefined;
}

/** `UpdateOptions` plus the manifest-derived lookup the config writers use for the home backup. */
export type ConfigUpdateOptions = UpdateOptions & { sigilOpsAt: SigilOpsAt };

/** Prints the final summary line (or the dry-run notice). */
function printUpdateSummary(
  opts: UpdateOptions,
  updatedCount: number,
  skippedDrift: number,
  orphanedCount: number,
): void {
  if (!opts.dryRun) {
    console.log(
      `\n✓ ${updatedCount} artifact(s) updated` +
        (skippedDrift > 0 ? `, ${skippedDrift} file(s) skipped (drifted)` : '') +
        (orphanedCount > 0 ? `, ${orphanedCount} no longer in the catalog (run sigil prune)` : '') +
        '.',
    );
  } else {
    console.log('\nDry run complete. No files were written.');
  }
  console.log('');
}

export interface UpdateRunTotals {
  updatedCount: number;
  /** In a preview (`--dry-run`): how many artifacts would change. */
  pendingCount: number;
  skippedDrift: number;
  orphanedCount: number;
}

interface UpdateRunSetup {
  target: Target;
  manifest: Manifest;
  /** Every artifact id the manifest records for the target, across all its catalogs. */
  installedIds: Set<string>;
  /** Every fragment the manifest records for a destination's file, for the home backup check. */
  sigilOpsAt: SigilOpsAt;
  /** One group per catalog this run touches, in report order (bundled first). */
  groups: UpdateGroup[];
}

/** Throws unless the target supports whole-file scaffolding (required for `sigil update`). */
function assertTargetSupportsUpdate(target: Target, targetName: string): void {
  if (!target.scaffold) {
    throw new SigilError(`Target '${targetName}' does not support the update command.`);
  }
}

/** Every artifact id the manifest records for `targetName` (see UpdateOptions.installedIds). */
function installedIdsFor(manifest: Manifest, targetName: string): Set<string> {
  return new Set(manifest.entries.filter(e => e.target === targetName).map(e => e.id));
}

/**
 * Builds everything runUpdate needs, loading each catalog the manifest records (but only after
 * refusing to run on a recorded one that is gone). Prints the "nothing to update" message and
 * returns undefined when the whole-manifest entry filter matched zero entries.
 */
async function prepareUpdateRun(
  ids: string[],
  opts: UpdateOptions,
): Promise<UpdateRunSetup | undefined> {
  const targetName = opts.target ?? detectProjectTarget(opts.projectDir, { verbose: false });
  const target = getTarget(targetName);
  assertTargetSupportsUpdate(target, targetName);

  const manifest = requireManifest(opts.projectDir);
  const idFilter = new Set(ids);
  if (filterEntriesToUpdate(manifest, targetName, idFilter).length === 0) {
    printNoEntriesMessage(idFilter, targetName);
    return undefined;
  }

  const sourceGroups = groupBySource(manifest.entries, opts);
  assertReachable(sourceGroups, opts.projectDir);
  const groups = await loadUpdateGroups(sourceGroups, targetName, idFilter, opts.projectDir);

  const installedIds = installedIdsFor(manifest, targetName);
  const sigilOpsAt: SigilOpsAt = dest => recordedOpsAt(manifest, dest);
  return { target, manifest, installedIds, sigilOpsAt, groups };
}

export async function runUpdate(ids: string[], opts: UpdateOptions): Promise<void> {
  if (shouldGuideUpdate(opts)) await runGuidedUpdate(ids, opts, applyUpdate);
  else await applyUpdate(ids, opts);
}

/** Runs the update. Returns the run totals, or undefined when no installed artifact matched. */
async function applyUpdate(
  ids: string[],
  opts: UpdateOptions,
): Promise<UpdateRunTotals | undefined> {
  const setup = await prepareUpdateRun(ids, opts);
  if (!setup) return undefined;
  const { target, manifest, installedIds, sigilOpsAt, groups } = setup;

  console.log('');
  const written: WrittenConfig[] = [];
  const runOpts: ConfigUpdateOptions = { ...opts, installedIds, sigilOpsAt };
  const totals = await updateEachGroup(groups, target, runOpts, written);
  warnMcpEnvCaveats(written, target);

  if (!opts.dryRun) saveManifest(opts.projectDir, manifest);
  printUpdateSummary(opts, totals.updatedCount, totals.skippedDrift, totals.orphanedCount);
  await finishEachGroup(groups, target, installedIds, opts);
  return totals;
}
