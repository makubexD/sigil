/**
 * Restore artifacts whose installed files were deleted. There is no `sigil restore` verb on
 * purpose: this is the home menu's one-step answer to `status` reporting `missing`.
 *
 * `sigil update` re-renders files that exist but does not recreate a deleted whole-file artifact,
 * and `sigil add` needs to be told which. Whole files therefore come back through `add`, and config
 * fragments (hook/settings/mcp) through `update`, which re-merges them.
 *
 * @module
 */
import { computeStatus, loadManifest } from '../manifest';
import type { StatusResult } from '../manifest/types';
import { isConfigKind } from '../kinds';
import { runAdd } from './add';
import { runUpdate } from './update';

export interface RestoreOptions {
  projectDir: string;
  catalogDir: string;
  packs: string;
}

/** Restores every missing artifact. Returns the ids it restored (none when nothing was missing). */
export async function restoreMissing(opts: RestoreOptions): Promise<string[]> {
  const manifest = loadManifest(opts.projectDir);
  const known = new Set(manifest.entries.map(e => e.id));
  const missing = computeStatus(manifest, opts.projectDir, known).filter(
    s => s.status === 'missing',
  );
  for (const [target, results] of groupByTarget(missing)) {
    const files = results.filter(r => !isConfigKind(r.entry.kind));
    const config = results.filter(r => isConfigKind(r.entry.kind));
    if (files.length > 0) await restoreFiles(target, files, opts);
    if (config.length > 0) await restoreConfig(target, config, opts);
  }
  return missing.map(s => s.entry.id);
}

function groupByTarget(results: StatusResult[]): Map<string, StatusResult[]> {
  const groups = new Map<string, StatusResult[]>();
  for (const result of results) {
    groups.set(result.entry.target, [...(groups.get(result.entry.target) ?? []), result]);
  }
  return groups;
}

async function restoreFiles(
  target: string,
  results: StatusResult[],
  opts: RestoreOptions,
): Promise<void> {
  await runAdd(
    results.map(r => `${r.entry.kind}:${r.entry.id}`),
    {
      ...opts,
      target,
      deps: false,
      dryRun: false,
      interactive: false,
      yes: true,
      overwrite: false,
      settingsLocal: false,
    },
  );
}

async function restoreConfig(
  target: string,
  results: StatusResult[],
  opts: RestoreOptions,
): Promise<void> {
  const ids = results.map(r => r.entry.id);
  await runUpdate(ids, { ...opts, target, force: false, dryRun: false, yes: true });
}
