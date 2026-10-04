/**
 * `sigil update`: moves a config fragment recorded at a file its provider no longer writes
 * (`Target.retiredConfigDestinations`) to the file that replaced it. Copilot's MCP servers moved
 * from VS Code's deprecated `.vscode/mcp.json` and user-profile `mcp.json` to the portable
 * `.mcp.json` and `~/.copilot/mcp-config.json`; any provider can declare such a move as data.
 *
 * A move merges the catalog's current op into the new file (unless the entry already records it
 * there), takes sigil's fragment out of the old file the way `uninstall` does, and updates the
 * manifest entry. A fragment the user edited in the old file is left alone without `--force`.
 *
 * @module
 */
import fs from 'node:fs';
import { canonicalize, classifyConfigDrift } from '../config-merge';
import { isAtRetiredDestination, sha256 } from '../manifest';

export { isAtRetiredDestination };
import type { ManifestConfigMerge, ManifestEntry } from '../manifest/types';
import type { ConfigMergeOp, RetiredConfigDestination } from '../types';
import type { UpdateOptions } from './update';
import {
  readExistingOrWarn,
  resolveConfigFileTarget,
  writeMergedConfigFile,
} from './update-config-io';
import { reverseMergeOneConfigFile } from './uninstall-config';

/** What moving an entry's retired fragments did. */
export interface MoveResult {
  /** A file was written (or would be, under --dry-run). */
  readonly wrote: boolean;
  /** Fragments kept in a retired file because the user edited them (they need --force). */
  readonly skipped: number;
}

const rootOf = (d: { root?: string | undefined }) => d.root ?? 'project';
const sameFile = (a: { file: string; root?: string | undefined }, b: typeof a) =>
  a.file === b.file && rootOf(a) === rootOf(b);

/** The manifest record for `op`, as `add` writes it. */
function recordOf(op: ConfigMergeOp): ManifestConfigMerge {
  return {
    file: op.file,
    ...(op.root && op.root !== 'project' ? { root: op.root } : {}),
    fragment: op.fragment,
    strategy: op.strategy as Record<string, string>,
    fragmentSha256: sha256(canonicalize(op.fragment)),
  };
}

/**
 * Merges `next` into its file and records it on `entry`, unless the entry already records it.
 * False when the new file is not valid JSON (already reported): the move doesn't happen.
 */
function mergeIntoNewFile(entry: ManifestEntry, next: ConfigMergeOp, projectDir: string): boolean {
  if ((entry.configFiles ?? []).some(cf => sameFile(cf, next))) return true; // already there
  const record = recordOf(next);
  const { fullPath } = resolveConfigFileTarget(record, projectDir);
  const existing = readExistingOrWarn(fullPath, entry.id, next.file);
  if (existing === undefined) return false;
  writeMergedConfigFile(fullPath, existing, { next });
  entry.configFiles = [...(entry.configFiles ?? []), record];
  return true;
}

/** Whether the old file can be moved: 'go', 'skipped' (edited, no --force) or 'none' (bad JSON). */
function moveGate(
  entry: ManifestEntry,
  cf: ManifestConfigMerge,
  next: ConfigMergeOp,
  opts: UpdateOptions,
): 'go' | 'skipped' | 'none' {
  const { fullPath, op: recorded } = resolveConfigFileTarget(cf, opts.projectDir);
  const existing = readExistingOrWarn(fullPath, entry.id, cf.file);
  if (existing === undefined) return 'none';
  if (classifyConfigDrift(existing, recorded) !== 'modified' || opts.force) return 'go';
  console.log(
    `  ⊘  ${entry.id}\n     ${cf.file}  (moved to ${next.file}, but sigil's values here were edited — use --force)`,
  );
  return 'skipped';
}

/** Moves one recorded fragment; 'moved', 'skipped' (edited, no --force) or 'none'. */
function moveOne(
  entry: ManifestEntry,
  cf: ManifestConfigMerge,
  next: ConfigMergeOp,
  opts: UpdateOptions,
): 'moved' | 'skipped' | 'none' {
  const gate = moveGate(entry, cf, next, opts);
  if (gate !== 'go') return gate;
  if (opts.dryRun) {
    console.log(`  ↑  ${entry.id}\n     ${cf.file} → ${next.file}  (would be moved)`);
    return 'moved';
  }
  if (!mergeIntoNewFile(entry, next, opts.projectDir)) return 'none';
  // Forget the old record only once sigil's entry is out of the old file (or the file is gone);
  // otherwise uninstall still needs it to find the server there.
  const removed = reverseMergeOneConfigFile(cf, opts.projectDir);
  if (removed || !fs.existsSync(resolveConfigFileTarget(cf, opts.projectDir).fullPath)) {
    entry.configFiles = (entry.configFiles ?? []).filter(c => c !== cf);
  }
  console.log(`  ✓  ${entry.id}  (${cf.file} moved to ${next.file})`);
  return 'moved';
}

/** Moves every fragment `entry` records at a retired destination to the file that replaced it. */
export function moveRetiredFragments(
  entry: ManifestEntry,
  opts: UpdateOptions,
  freshOps: readonly ConfigMergeOp[],
  retired: readonly RetiredConfigDestination[],
): MoveResult {
  let wrote = false;
  let skipped = 0;
  for (const cf of [...(entry.configFiles ?? [])]) {
    const move = retired.find(r => sameFile(cf, r.from));
    const next = move && freshOps.find(op => sameFile(op, move.to));
    if (!next) continue; // not retired, or the catalog no longer has it (reported elsewhere)
    const outcome = moveOne(entry, cf, next, opts);
    if (outcome === 'moved') wrote = true;
    if (outcome === 'skipped') skipped++;
  }
  return { wrote, skipped };
}
