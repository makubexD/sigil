/**
 * `sigil update [ids...]` command — refresh installed artifacts to the current catalog version.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * DRY fix: replaces 7 inline `require('fs'/'path')` calls with top-level node:fs / node:path
 * imports (the modules were already imported in cli.ts; the require() calls were a mistake).
 * The file-drift detection is extracted into `isFileDrifted` — a pure, testable helper.
 *
 * @module
 */
import { resolveCatalog } from '../resolve';
import { loadAndValidate, detectProjectTarget } from '../cli-helpers';
import { getTarget } from '../targets';
import { saveManifest } from '../manifest';
import { requireManifest } from './shared/manifest';
import type { ManifestEntry, Manifest } from '../manifest/types';
import type { ResolvedCatalog, Target } from '../types';
import { SigilError } from '../errors';
import { applyConfigEntry, isConfigEntry } from './update-config';
import { catalogConfigOps } from './update-config-catalog';
import { updateWholeFileEntry } from './update-wholefile';
import { runGuidedUpdate, shouldGuideUpdate } from './update-guided';

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

/** Filters manifest entries by target (and by explicit ids, when provided). */
function filterEntriesToUpdate(
  manifest: { entries: ManifestEntry[] },
  targetName: string,
  idFilter: Set<string>,
): ManifestEntry[] {
  return manifest.entries.filter(
    e => e.target === targetName && (idFilter.size === 0 || idFilter.has(e.id)),
  );
}

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

/** Prints the "nothing to update" message when the entry filter matched zero entries. */
function printNoEntriesMessage(idFilter: Set<string>, targetName: string): void {
  const msg =
    idFilter.size > 0
      ? `No installed artifacts match: ${[...idFilter].join(', ')}`
      : `No artifacts installed for target '${targetName}'.`;
  console.log(`\n  ${msg}\n`);
}

interface EntryUpdateOutcome {
  updated: boolean;
  pending?: boolean;
  skippedDriftCount: number;
  orphaned: boolean;
}

/** Shared context for the update-run helpers below. */
interface UpdateRunCtx {
  catalogIds: Set<string>;
  resolved: ResolvedCatalog;
  target: Target;
  opts: UpdateOptions;
}

/** Brings a config-kind entry (hook/settings/mcp) up to date. */
async function updateConfigOutcome(
  entry: ManifestEntry,
  ctx: UpdateRunCtx,
): Promise<EntryUpdateOutcome> {
  const { opts } = ctx;
  const freshOps = await catalogConfigOps(entry.id, ctx, opts.projectDir);
  const { wrote, skipped } = applyConfigEntry(entry, opts, freshOps);
  const pending = wrote && !!opts.dryRun;
  return { updated: wrote, pending, skippedDriftCount: skipped, orphaned: false };
}

/** Updates one manifest entry: orphan check, then config-kind or whole-file update. */
async function updateOneEntry(
  entry: ManifestEntry,
  ctx: UpdateRunCtx,
): Promise<EntryUpdateOutcome> {
  const { catalogIds, resolved, target, opts } = ctx;
  if (!catalogIds.has(entry.id)) {
    console.log(`  ✗  ${entry.id}  (no longer in the catalog — run sigil prune to clean up)`);
    return { updated: false, skippedDriftCount: 0, orphaned: true };
  }

  if (isConfigEntry(entry)) return updateConfigOutcome(entry, ctx);
  const result = await updateWholeFileEntry(entry, resolved, target, opts);
  return { ...result, orphaned: false };
}

export interface UpdateRunTotals {
  updatedCount: number;
  /** In a preview (`--dry-run`): how many artifacts would change. */
  pendingCount: number;
  skippedDrift: number;
  orphanedCount: number;
}

/** Updates every manifest entry in sequence, aggregating the run totals. */
async function updateAllEntries(
  entries: ManifestEntry[],
  ctx: UpdateRunCtx,
): Promise<UpdateRunTotals> {
  let updatedCount = 0;
  let pendingCount = 0;
  let skippedDrift = 0;
  let orphanedCount = 0;

  for (const entry of entries) {
    const outcome = await updateOneEntry(entry, ctx);
    if (outcome.orphaned) orphanedCount++;
    if (outcome.updated) updatedCount++;
    if (outcome.pending) pendingCount++;
    skippedDrift += outcome.skippedDriftCount;
  }

  return { updatedCount, pendingCount, skippedDrift, orphanedCount };
}

interface UpdateRunSetup {
  resolved: ResolvedCatalog;
  target: Target;
  manifest: Manifest;
  entries: ManifestEntry[];
  catalogIds: Set<string>;
  installedIds: Set<string>;
}

/** Loads + validates everything runUpdate needs; prints the "nothing to update" message and
 * returns undefined when the entry filter matched zero entries. */
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

async function prepareUpdateRun(
  ids: string[],
  opts: UpdateOptions,
): Promise<UpdateRunSetup | undefined> {
  const { catalog: rawCatalog } = await loadAndValidate(opts.catalogDir, opts.packs);
  const resolved = resolveCatalog(rawCatalog);
  const targetName = opts.target ?? detectProjectTarget(opts.projectDir, { verbose: false });
  const target = getTarget(targetName);
  assertTargetSupportsUpdate(target, targetName);

  const manifest = requireManifest(opts.projectDir);
  const idFilter = new Set(ids);
  const entries = filterEntriesToUpdate(manifest, targetName, idFilter);
  if (entries.length === 0) {
    printNoEntriesMessage(idFilter, targetName);
    return undefined;
  }

  const catalogIds = new Set(rawCatalog.artifacts.map(a => a.id));
  const installedIds = installedIdsFor(manifest, targetName);
  return { resolved, target, manifest, entries, catalogIds, installedIds };
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
  const { resolved, target, manifest, entries, catalogIds, installedIds } = setup;

  console.log('');
  const totals = await updateAllEntries(entries, {
    catalogIds,
    resolved,
    target,
    opts: { ...opts, installedIds },
  });

  if (!opts.dryRun) {
    saveManifest(opts.projectDir, manifest);
  }
  printUpdateSummary(opts, totals.updatedCount, totals.skippedDrift, totals.orphanedCount);
  return totals;
}
