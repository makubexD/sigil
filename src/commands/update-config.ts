/**
 * Config-kind (mcp/hook/settings) restore-or-re-merge logic for `sigil update`.
 * Split out of update.ts to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { applyMerge, serialize, detectConfigDrift } from '../config-merge';
import { resolveConfigRoot } from '../config-utils';
import { isConfigKind } from '../kinds';
import type { ManifestEntry, ManifestConfigMerge } from '../manifest/types';
import type { ConfigMergeOp, ConfigRoot, MergeStrategy } from '../types';
import type { UpdateOptions } from './update';

/** True when `entry` is a config-kind (hook/settings/mcp) install record. */
export function isConfigEntry(entry: ManifestEntry): boolean {
  return isConfigKind(entry.kind) && !!entry.configFiles && entry.configFiles.length > 0;
}

/** Read+parse a config JSON file; returns {} for a missing file, undefined for invalid JSON. */
function readConfigFile(fullPath: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(fullPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Builds the ConfigMergeOp from a recorded manifest config-merge entry. */
function buildConfigMergeOp(cf: ManifestConfigMerge): ConfigMergeOp {
  return {
    file: cf.file,
    root: cf.root as ConfigRoot | undefined,
    fragment: cf.fragment,
    strategy: cf.strategy as Record<string, MergeStrategy>,
  };
}

/** One config fragment's identity, threaded through {@link configFileNeedsRestore}. */
interface ConfigFileSpec {
  op: ConfigMergeOp;
  cfFile: string;
  existedOnDisk: boolean;
}

/**
 * Decides whether `cf` needs restoring. Returns the restore/re-merge action label, or
 * false when it's already intact (silent) or drifted-without-force (prints a skip note).
 */
function configFileNeedsRestore(
  existing: Record<string, unknown>,
  spec: ConfigFileSpec,
  opts: UpdateOptions,
): 'restored' | 're-merged' | false {
  const { op, cfFile, existedOnDisk } = spec;
  if (existedOnDisk && !detectConfigDrift(existing, op)) {
    return false; // fragment already present and intact — nothing to restore
  }
  if (existedOnDisk && !opts.force) {
    console.log(`     ⊘ ${cfFile}  (drifted — would skip without --force)`);
    return false;
  }
  return existedOnDisk ? 're-merged' : 'restored';
}

/** Merges `existing` with `op` and writes the result to `fullPath`, creating parent dirs. */
function writeMergedConfigFile(
  fullPath: string,
  existing: Record<string, unknown>,
  op: ConfigMergeOp,
): void {
  const merged = applyMerge(existing, op);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, serialize(merged), 'utf-8');
}

/** Resolves the on-disk path + ConfigMergeOp for a recorded config-merge entry. */
function resolveConfigFileTarget(
  cf: ManifestConfigMerge,
  projectDir: string,
): { fullPath: string; op: ConfigMergeOp } {
  const rootDir = resolveConfigRoot(cf.root as ConfigRoot | undefined, projectDir);
  return { fullPath: path.join(rootDir, cf.file), op: buildConfigMergeOp(cf) };
}

/** Reads the existing config JSON, or logs + returns undefined if it's not valid JSON. */
function readExistingOrWarn(
  fullPath: string,
  entryId: string,
  cfFile: string,
): Record<string, unknown> | undefined {
  const existing = readConfigFile(fullPath);
  if (existing === undefined) {
    console.error(`  ✗  ${entryId}: ${cfFile} exists but is not valid JSON. Skipped.`);
  }
  return existing;
}

/**
 * Restore or re-merge one recorded config fragment file onto disk. Returns true when the
 * file was written (or would be, under --dry-run); false when skipped or already intact.
 */
function updateOneConfigFile(
  cf: ManifestConfigMerge,
  entry: ManifestEntry,
  opts: UpdateOptions,
): boolean {
  const { fullPath, op } = resolveConfigFileTarget(cf, opts.projectDir);
  const existing = readExistingOrWarn(fullPath, entry.id, cf.file);
  if (existing === undefined) return false;

  const spec = { op, cfFile: cf.file, existedOnDisk: fs.existsSync(fullPath) };
  const action = configFileNeedsRestore(existing, spec, opts);
  if (!action) return false;

  if (opts.dryRun) {
    console.log(`  ↑  ${entry.id}\n     ~ ${cf.file}  (would be ${action})`);
    return true;
  }

  writeMergedConfigFile(fullPath, existing, op);
  console.log(`  ✓  ${entry.id}  (${cf.file} ${action})`);
  return true;
}

/**
 * Restore or re-merge one recorded config fragment (hook/settings/mcp) onto disk.
 * Unlike whole-file entries, the fresh content comes from the manifest's own recorded
 * fragment — not from re-scaffolding — since a config file is user-owned and sigil only
 * owns a sub-tree of it. Returns true when at least one file was written (or would be,
 * under --dry-run).
 */
export function updateConfigEntry(entry: ManifestEntry, opts: UpdateOptions): boolean {
  let wrote = false;
  for (const cf of entry.configFiles ?? []) {
    if (updateOneConfigFile(cf, entry, opts)) wrote = true;
  }
  return wrote;
}
