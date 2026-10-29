/**
 * Running `sigil update` once per catalog the manifest records.
 *
 * A manifest records the catalog each entry came from (`src/manifest/catalog-source.ts`), so the
 * command loads each distinct catalog, with the project overlays, and runs its per-catalog logic on
 * that group's entries only. This module owns the per-group run: loading a group, updating its
 * entries, then installing the dependencies it gained through its own catalog.
 *
 * @module
 */
import { loadAndValidate } from '../cli-helpers';
import { overlayProject, reportOverlayIssues, withoutRefused } from '../overlay-report';
import { resolveCatalog } from '../resolve';
import { catalogConfigOps } from '../freshness';
import { applyConfigEntry, isConfigEntry } from './update-config';
import { isAtRetiredDestination, moveRetiredFragments } from './update-config-move';
import { inlinedDependencies, inlinedNotice } from './shared/inlined-deps';
import { installNewDependencies } from './update-deps';
import { filterEntriesToUpdate } from './update-entries';
import { printSourceLine } from './shared/catalog-groups';
import { updateWholeFileEntry } from './update-wholefile';
import type { CatalogSource, SourceGroup } from '../manifest/catalog-source';
import type { ManifestEntry } from '../manifest/types';
import type { OverlaidCatalog } from '../overlays';
import type { LoadedCatalog, ResolvedCatalog, Target } from '../types';
import type { WrittenConfig } from './add/execute-config';
import type { ConfigUpdateOptions, UpdateOptions, UpdateRunTotals } from './update';

/** One catalog's slice of an update run. */
export interface UpdateGroup {
  /** The recorded source, absent for the bundled catalog. */
  source?: CatalogSource | undefined;
  /** Absolute catalog directory this group is judged against. */
  catalogDir: string;
  /** Absolute `packs.yaml` this group is judged against. */
  packs: string;
  /** The group's catalog with project overlays applied. */
  resolved: ResolvedCatalog;
  /** Every artifact id the group's catalog holds. */
  catalogIds: Set<string>;
  /** The group's entries this run updates (target + ids, minus overlay-refused ones). */
  entries: ManifestEntry[];
  /** Every entry of this group for the target, which the inlined-dependency notice reads. */
  installed: ManifestEntry[];
}

/** One group's catalog with the project overlays applied, before its entries are picked. */
interface LoadedGroup {
  group: SourceGroup;
  rawCatalog: LoadedCatalog;
  overlaid: OverlaidCatalog;
}

/** Loads one group's catalog and overlays it, reporting nothing yet. */
async function loadGroup(group: SourceGroup, projectDir: string): Promise<LoadedGroup> {
  const { catalog: rawCatalog } = await loadAndValidate(group.catalogDir, group.packs);
  return { group, rawCatalog, overlaid: overlayProject(resolveCatalog(rawCatalog), projectDir) };
}

/** The group's entries this run updates, as an UpdateGroup; undefined when it has none. */
function toUpdateGroup(
  { group, rawCatalog, overlaid }: LoadedGroup,
  targetName: string,
  idFilter: ReadonlySet<string>,
): UpdateGroup | undefined {
  const picked = filterEntriesToUpdate(group, targetName, idFilter);
  const entries = withoutRefused(picked, overlaid.refused);
  if (entries.length === 0) return undefined;
  return {
    source: group.source,
    catalogDir: group.catalogDir,
    packs: group.packs,
    resolved: overlaid.resolved,
    catalogIds: new Set(rawCatalog.artifacts.map(a => a.id)),
    entries,
    installed: filterEntriesToUpdate(group, targetName, new Set()),
  };
}

/**
 * Loads every group's catalog, reports the overlay issues once across them, then picks each group's
 * entries; groups with nothing to update are left out.
 */
export async function loadUpdateGroups(
  groups: readonly SourceGroup[],
  targetName: string,
  idFilter: ReadonlySet<string>,
  projectDir: string,
): Promise<UpdateGroup[]> {
  const loaded: LoadedGroup[] = [];
  for (const group of groups) loaded.push(await loadGroup(group, projectDir));
  reportOverlayIssues(loaded.map(l => l.overlaid));
  return loaded.flatMap(l => toUpdateGroup(l, targetName, idFilter) ?? []);
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
  opts: ConfigUpdateOptions;
  /** Config artifacts this run wrote, for the one MCP env warning at the end. */
  written: WrittenConfig[];
}

/** Brings a config-kind entry (hook/settings/mcp) up to date. */
async function updateConfigOutcome(
  entry: ManifestEntry,
  ctx: UpdateRunCtx,
): Promise<EntryUpdateOutcome> {
  const { opts } = ctx;
  const freshOps = await catalogConfigOps(entry.id, ctx, opts.projectDir);
  const retired = ctx.target.retiredConfigDestinations ?? [];
  const moved = moveRetiredFragments(entry, opts, freshOps, retired);
  const applied = applyConfigEntry(entry, opts, freshOps, cf =>
    isAtRetiredDestination(cf, retired),
  );
  const wrote = moved.wrote || applied.wrote;
  const skipped = moved.skipped + applied.skipped;
  const pending = wrote && !!opts.dryRun;
  const artifact = ctx.resolved.byId.get(entry.id);
  if (wrote && !opts.dryRun && artifact) ctx.written.push({ id: entry.id, artifact });
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

/** Updates one group's entries in sequence, aggregating that group's run totals. */
async function updateAllEntries(
  entries: readonly ManifestEntry[],
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

/** The totals of a run that has updated nothing yet. */
const NO_TOTALS: UpdateRunTotals = {
  updatedCount: 0,
  pendingCount: 0,
  skippedDrift: 0,
  orphanedCount: 0,
};

/** Sums one group's totals into the run's (each group reports its own). */
function addTotals(a: UpdateRunTotals, b: UpdateRunTotals): UpdateRunTotals {
  return {
    updatedCount: a.updatedCount + b.updatedCount,
    pendingCount: a.pendingCount + b.pendingCount,
    skippedDrift: a.skippedDrift + b.skippedDrift,
    orphanedCount: a.orphanedCount + b.orphanedCount,
  };
}

/** Updates each group's entries against its own catalog, printing its `Using catalog` line first. */
export async function updateEachGroup(
  groups: readonly UpdateGroup[],
  target: Target,
  opts: ConfigUpdateOptions,
  written: WrittenConfig[],
): Promise<UpdateRunTotals> {
  let totals = NO_TOTALS;
  for (const group of groups) {
    printSourceLine(group.source);
    totals = addTotals(
      totals,
      await updateAllEntries(group.entries, groupRun(group, target, opts, written)),
    );
  }
  return totals;
}

/** The update-run context for one group, with that group's catalog paths. */
function groupRun(
  group: UpdateGroup,
  target: Target,
  opts: ConfigUpdateOptions,
  written: WrittenConfig[],
): UpdateRunCtx {
  const groupOpts = { ...opts, catalogDir: group.catalogDir, packs: group.packs };
  return {
    catalogIds: group.catalogIds,
    resolved: group.resolved,
    target,
    opts: groupOpts,
    written,
  };
}

/** Installs the dependencies each group gained through that group's catalog, then points at prune. */
export async function finishEachGroup(
  groups: readonly UpdateGroup[],
  target: Target,
  installedIds: ReadonlySet<string>,
  opts: UpdateOptions,
): Promise<void> {
  for (const group of groups) {
    const groupOpts = { ...opts, catalogDir: group.catalogDir, packs: group.packs };
    await installNewDependencies(
      { entries: group.entries, resolved: group.resolved, target, installedIds },
      groupOpts,
    );
    printInlinedNotice(group.installed, target, group.resolved);
  }
}

/** Points at `sigil prune` when an installed dependency is now carried inline by its parent. */
function printInlinedNotice(
  entries: readonly ManifestEntry[],
  target: Target,
  resolved: ResolvedCatalog,
): void {
  const { removable, unconfirmed } = inlinedDependencies(entries, target, resolved);
  const lines = inlinedNotice(
    removable.map(e => e.id),
    unconfirmed.map(e => e.id),
  );
  if (lines.length === 0) return;
  for (const line of lines) console.error(line);
  console.error('');
}
