/**
 * Config-kind (mcp/hook/settings) restore-or-re-merge logic for `sigil update`.
 * Split out of update.ts to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import fs from 'node:fs';
import { classifyConfigDrift } from '../config-merge';
import { isConfigKind } from '../kinds';
import { sameDestination } from '../manifest';
import type { ManifestEntry, ManifestConfigMerge } from '../manifest/types';
import type { ConfigMergeOp } from '../types';
import type { UpdateOptions } from './update';
import { applyCatalogChange, changedCatalogOp } from './update-config-catalog';
import {
  readExistingOrWarn,
  resolveConfigFileTarget,
  writeMergedConfigFile,
} from './update-config-io';

/** True when `entry` is a config-kind (hook/settings/mcp) install record. */
export function isConfigEntry(entry: ManifestEntry): boolean {
  return isConfigKind(entry.kind) && !!entry.configFiles && entry.configFiles.length > 0;
}

/** One config fragment's identity, threaded through {@link configFileNeedsRestore}. */
interface ConfigFileSpec {
  op: ConfigMergeOp;
  cfFile: string;
  existedOnDisk: boolean;
}

/**
 * Decides whether `cf` needs restoring. Returns the restore/re-merge action label, or
 * false when nothing was written (prints a skip note for the `modified`-without-`--force` case).
 *
 * `missing` (sigil's fragment is wholly absent from an existing file) is restored **without**
 * `--force` — re-merging is purely additive, there is nothing of the user's to clobber. Only
 * `modified` (a value sigil contributed was changed) requires `--force`, since overwriting it
 * would discard a real edit. See docs/decisions/catalog-usage-audit-2026-08-21.md F14 — collapsing
 * this into a single boolean is what let a hook fragment silently stay unrepaired.
 */
function configFileNeedsRestore(
  existing: Record<string, unknown>,
  spec: ConfigFileSpec,
  opts: UpdateOptions,
): 'restored' | 're-merged' | false {
  const { op, cfFile, existedOnDisk } = spec;
  if (!existedOnDisk) return 'restored'; // the file itself doesn't exist yet — nothing to clobber

  const drift = classifyConfigDrift(existing, op);
  if (drift === 'intact') return false;
  if (drift === 'missing') return 'restored'; // sigil's fragment is gone entirely — safe to re-add
  if (!opts.force) {
    console.log(`     ⊘ ${cfFile}  (sigil's values were changed — would skip without --force)`);
    return false;
  }
  return 're-merged';
}

/**
 * Restore or re-merge one recorded config fragment file onto disk. Returns true when the
 * file was written (or would be, under --dry-run); false when skipped or already intact.
 */
function updateOneConfigFile(
  cf: ManifestConfigMerge,
  op: ConfigMergeOp,
  entry: ManifestEntry,
  opts: UpdateOptions,
): boolean {
  const { fullPath } = resolveConfigFileTarget(cf, opts.projectDir);
  const existing = readExistingOrWarn(fullPath, entry.id, cf.file);
  if (existing === undefined) return false;

  const spec = { op, cfFile: cf.file, existedOnDisk: fs.existsSync(fullPath) };
  const action = configFileNeedsRestore(existing, spec, opts);
  if (!action) return false;

  if (opts.dryRun) {
    console.log(`  ↑  ${entry.id}\n     ~ ${cf.file}  (would be ${action})`);
    return true;
  }

  writeMergedConfigFile(fullPath, existing, { next: op });
  console.log(`  ✓  ${entry.id}  (${cf.file} ${action})`);
  return true;
}

/**
 * Brings one recorded fragment up to date from the catalog. The manifest is committed and
 * editable, so it only names *which* catalog fragment to maintain, never what to write: a
 * destination the catalog has no op for is skipped, and a missing fragment is restored from the
 * catalog's op, not the recorded copy.
 */
function updateFromCatalog(
  cf: ManifestConfigMerge,
  entry: ManifestEntry,
  opts: UpdateOptions,
  freshOps: readonly ConfigMergeOp[],
): boolean {
  const current = freshOps.find(op => sameDestination(cf, op));
  if (!current) {
    console.log(`  ⊘  ${entry.id}
     ${cf.file}  (${NOT_IN_CATALOG})`);
    return false;
  }
  const changed = changedCatalogOp(cf, freshOps);
  if (changed) return applyCatalogChange(cf, changed, entry, opts);
  return updateOneConfigFile(cf, current, entry, opts);
}

const NOT_IN_CATALOG =
  'not in the current catalog for this destination — not restored; re-run sigil add';

/**
 * Brings each recorded config fragment (hook/settings/mcp) up to date. `freshOps` are the
 * catalog's current ops for this artifact (see updateFromCatalog). Returns true when at least
 * one file was written (or would be, under --dry-run).
 */
export function updateConfigEntry(
  entry: ManifestEntry,
  opts: UpdateOptions,
  freshOps: readonly ConfigMergeOp[],
): boolean {
  let wrote = false;
  for (const cf of entry.configFiles ?? []) {
    if (updateFromCatalog(cf, entry, opts, freshOps)) wrote = true;
  }
  return wrote;
}
