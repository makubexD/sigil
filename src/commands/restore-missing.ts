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
import { retiredConfigDestinationsOf } from '../targets';
import type { StatusResult } from '../manifest/types';
import { isConfigKind } from '../kinds';
import { runAdd } from './add';
import { runUpdate } from './update';

export interface RestoreOptions {
  projectDir: string;
  catalogDir: string;
  packs: string;
}

/** Ids of the manifest entries whose files are currently missing. */
function missingResults(opts: RestoreOptions): StatusResult[] {
  const manifest = loadManifest(opts.projectDir);
  const known = new Set(manifest.entries.map(e => e.id));
  const extras = { retiredFor: retiredConfigDestinationsOf };
  return computeStatus(manifest, opts.projectDir, known, extras).filter(
    s => s.status === 'missing',
  );
}

/**
 * Restores every missing artifact. Returns the ids that are present again, measured afterwards:
 * `add` and `update` skip some things without failing (an artifact the catalog dropped, a kind the
 * target does not support), and those must not be reported as restored.
 */
export async function restoreMissing(opts: RestoreOptions): Promise<string[]> {
  const missing = missingResults(opts);
  for (const [target, results] of groupByTarget(missing)) {
    const files = results.filter(r => !isConfigKind(r.entry.kind));
    const config = results.filter(r => isConfigKind(r.entry.kind));
    if (files.length > 0) await restoreFiles(target, files, opts);
    if (config.length > 0) await restoreConfig(target, config, opts);
  }
  const stillMissing = new Set(missingResults(opts).map(s => s.entry.id));
  return missing.map(s => s.entry.id).filter(id => !stillMissing.has(id));
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
