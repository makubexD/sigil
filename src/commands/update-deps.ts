/**
 * Dependencies an updated artifact gained since it was installed. A skill that now `uses` another
 * rule needs that rule installed beside it, or an updated project differs from a fresh install of
 * the same picks (the skill expects a rule that isn't there). `update` installs them through the
 * same pipeline as `add` — conflict handling, manifest entries and `--dry-run` included — then
 * records them the way `add` does: as dependents of the artifacts that use them (what `uninstall`
 * and `prune` read), listed with the other whole-file entries. A dependency an artifact dropped is
 * never removed here; `prune` reports it.
 *
 * @module
 */
import { computeClosure } from '../select/closure';
import { runAdd } from './add/index';
import { isConfigEntry } from './update-config';
import { loadManifest, saveManifest } from '../manifest';
import type { ResolvedCatalog, Target } from '../types';
import type { ManifestEntry } from '../manifest/types';
import type { UpdateOptions } from './update';
import type { AddOpts } from './add/index';

/** A dependency to install, and the installed artifacts that use it. */
export interface MissingDependency {
  readonly id: string;
  readonly via: readonly string[];
}

/** Dependencies (`uses`) of `updatedIds` that aren't installed for the target yet. */
export function missingDependencies(
  updatedIds: readonly string[],
  resolved: ResolvedCatalog,
  target: Target,
  installedIds: ReadonlySet<string>,
): MissingDependency[] {
  const known = updatedIds.filter(id => resolved.byId.has(id));
  return computeClosure(known, resolved, target)
    .dependencies.filter(dep => !installedIds.has(dep.artifact.id))
    .map(dep => ({ id: dep.artifact.id, via: dep.via }));
}

/** Records each new entry as a dependent of `via` and moves it before the config entries. */
function recordAsDependencies(
  missing: readonly MissingDependency[],
  target: Target,
  projectDir: string,
): void {
  const manifest = loadManifest(projectDir);
  const viaOf = new Map(missing.map(dep => [dep.id, [...dep.via]]));
  const isNew = (e: { id: string; target: string }) => e.target === target.name && viaOf.has(e.id);
  const added = manifest.entries.filter(isNew);
  for (const entry of added) entry.dependentOf = viaOf.get(entry.id)!;
  const rest = manifest.entries.filter(entry => !isNew(entry));
  const firstConfig = rest.findIndex(entry => entry.target === target.name && isConfigEntry(entry));
  const at = firstConfig === -1 ? rest.length : firstConfig;
  manifest.entries = [...rest.slice(0, at), ...added, ...rest.slice(at)];
  saveManifest(projectDir, manifest);
}

/** `sigil add <ids> --no-deps --yes` for `target`, with the update run's paths and `--dry-run`. */
function addOptions(target: Target, opts: UpdateOptions): AddOpts {
  const { projectDir, catalogDir, packs } = opts;
  const quiet = { interactive: false, yes: true, overwrite: false, settingsLocal: false };
  const dryRun = !!opts.dryRun;
  return { target: target.name, projectDir, catalogDir, packs, deps: false, dryRun, ...quiet };
}

/** What an update run updated, and what it found installed. */
export interface UpdatedSet {
  readonly entries: readonly ManifestEntry[];
  readonly resolved: ResolvedCatalog;
  readonly target: Target;
  readonly installedIds: ReadonlySet<string>;
}

/** Installs the dependencies the updated artifacts gained, then records them as dependents. */
export async function installNewDependencies(run: UpdatedSet, opts: UpdateOptions): Promise<void> {
  const updatedIds = run.entries.map(entry => entry.id);
  const missing = missingDependencies(updatedIds, run.resolved, run.target, run.installedIds);
  if (missing.length === 0) return;
  const ids = missing.map(dep => dep.id);
  console.log(`\n  New dependencies of updated artifacts: ${ids.join(', ')}`);
  await runAdd(ids, addOptions(run.target, opts));
  if (!opts.dryRun) recordAsDependencies(missing, run.target, opts.projectDir);
}
