/**
 * `sigil uninstall` — config-kind (hook/settings/mcp) reverse-merge helpers.
 * Split out of uninstall.ts to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import fs from 'node:fs';
import { resolveContained } from '../cli-helpers';
import { resolveConfigRoot, isHomeScopedRoot, ensureHomeBackup } from '../config-utils';
import { reverseMerge, serialize } from '../config-merge';
import type { ConfigRoot, ConfigMergeOp, MergeStrategy } from '../types';
import { recordedOp, sameFile } from '../manifest';
import type { ManifestEntry } from '../manifest';
import { CONFIG_KINDS } from '../select';

/** Builds the ConfigMergeOp from a recorded manifest config-merge entry. */
function buildConfigMergeOpFromEntry(
  cf: NonNullable<ManifestEntry['configFiles']>[number],
): ConfigMergeOp {
  return {
    file: cf.file,
    root: cf.root as ConfigRoot | undefined,
    fragment: cf.fragment,
    strategy: cf.strategy as Record<string, MergeStrategy>,
  };
}

/** Writes (or deletes, if now empty) the reverse-merged config file; prints the result line. */
function writeReversedConfigFile(
  fullPath: string,
  cleaned: Record<string, unknown>,
  displayPath: string,
): void {
  if (Object.keys(cleaned).length === 0) {
    fs.unlinkSync(fullPath);
    console.log(`  - ${displayPath}  (emptied, deleted)`);
  } else {
    fs.writeFileSync(fullPath, serialize(cleaned), 'utf-8');
    console.log(`  ~ ${displayPath}  (JSON reverse-merge applied)`);
  }
}

/** Reverse-merges and removes sigil's contribution from one config-merge file; returns true
 * if it counted as removed (write succeeded or the file was deleted after emptying).
 * `sigilOps` is every fragment recorded for that file, so a file holding only those needs no backup. */
export function reverseMergeOneConfigFile(
  cf: NonNullable<ManifestEntry['configFiles']>[number],
  projectDir: string,
  sigilOps: readonly ConfigMergeOp[],
): boolean {
  const rootDir = resolveConfigRoot((cf.root as ConfigRoot | undefined) ?? 'project', projectDir);
  const fullPath = resolveContained(rootDir, cf.file); // the manifest is editable: stay in root
  const displayPath = isHomeScopedRoot(cf.root as ConfigRoot | undefined) ? fullPath : cf.file;
  if (!fs.existsSync(fullPath)) return false;

  try {
    if (isHomeScopedRoot(cf.root as ConfigRoot | undefined)) ensureHomeBackup(fullPath, sigilOps);
    const live = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Record<string, unknown>;
    const cleaned = reverseMerge(live, buildConfigMergeOpFromEntry(cf));
    writeReversedConfigFile(fullPath, cleaned, displayPath);
    return true;
  } catch (err) {
    console.warn(`  ⚠  Could not reverse-merge ${displayPath}: ${(err as Error).message}`);
    return false;
  }
}

type ConfigRecord = NonNullable<ManifestEntry['configFiles']>[number];

/** Every op `entries` records for `cf`'s file, including `cf` itself. */
function sigilOpsFor(cf: ConfigRecord, entries: readonly ManifestEntry[]): ConfigMergeOp[] {
  return entries.flatMap(entry =>
    (entry.configFiles ?? []).filter(c => sameFile(c, cf)).map(recordedOp),
  );
}

/** The removed entries that merged into JSON config files (hook/settings/mcp with records). */
export function configEntriesOf(removed: readonly ManifestEntry[]): ManifestEntry[] {
  return removed.filter(e => CONFIG_KINDS.has(e.kind) && (e.configFiles?.length ?? 0) > 0);
}

/**
 * The entry still installed that recorded the very same fragment in the same file — e.g. one MCP
 * server installed for both claude and copilot lands in the shared `.mcp.json`. Reversing it for
 * one target would take it away from the other.
 */
function sharedWith(cf: ConfigRecord, kept: readonly ManifestEntry[]): ManifestEntry | undefined {
  const same = (k: ConfigRecord) =>
    k.file === cf.file &&
    (k.root ?? 'project') === (cf.root ?? 'project') &&
    k.fragmentSha256 === cf.fragmentSha256;
  return kept.find(e => (e.configFiles ?? []).some(same));
}

/**
 * Reverse-merges and removes sigil's contribution from each config-kind entry's JSON files,
 * except a fragment an entry in `kept` (the manifest after removal) still records.
 */
export function reverseMergeConfigEntries(
  configEntriesToRemove: ManifestEntry[],
  projectDir: string,
  kept: readonly ManifestEntry[] = [],
): number {
  const allEntries = [...configEntriesToRemove, ...kept];
  let configRemovedCount = 0;
  for (const entry of configEntriesToRemove) {
    for (const cf of entry.configFiles ?? []) {
      const owner = sharedWith(cf, kept);
      if (owner)
        console.log(`  =  ${cf.file}  (kept: still used by ${owner.id} for ${owner.target})`);
      else if (reverseMergeOneConfigFile(cf, projectDir, sigilOpsFor(cf, allEntries)))
        configRemovedCount++;
    }
  }
  return configRemovedCount;
}
