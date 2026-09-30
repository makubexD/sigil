/**
 * Converting between a recorded config fragment (`ManifestConfigMerge`) and the `ConfigMergeOp`
 * that wrote it, and matching a fresh op to the record it supersedes. Shared by `sigil add`
 * (re-install replaces the previous fragment) and `sigil update` (a catalog change replaces it).
 *
 * @module
 */
import type { ConfigMergeOp, ConfigRoot, MergeStrategy } from '../types';
import type { ManifestConfigMerge, ManifestEntry } from './types';

/** Rebuilds the ConfigMergeOp a recorded fragment came from. */
export function recordedOp(cf: ManifestConfigMerge): ConfigMergeOp {
  return {
    file: cf.file,
    root: cf.root as ConfigRoot | undefined,
    fragment: cf.fragment,
    strategy: cf.strategy as Record<string, MergeStrategy>,
  };
}

/** A fragment scoped to one project inside a shared file (nested under `projects.<dir>`). */
const perProject = (fragment: Record<string, unknown>): boolean => 'projects' in fragment;

/**
 * True when `op` writes the same place `cf` recorded: same file and root. Two scopes can share
 * a file — Claude's local-scope MCP servers nest under `projects.<dir>` in `~/.claude.json`,
 * user-scope ones sit at its top level — so the `projects` nesting must match too. The rest of
 * the fragment is free to change: a catalog release may add or drop top-level keys.
 */
export function sameDestination(cf: ManifestConfigMerge, op: ConfigMergeOp): boolean {
  return (
    cf.file === op.file &&
    (cf.root ?? 'project') === (op.root ?? 'project') &&
    perProject(cf.fragment) === perProject(op.fragment)
  );
}

/** The fragment `entry` recorded for `op`'s destination, as an op, if any. */
export function previousOpFor(
  entry: ManifestEntry | undefined,
  op: ConfigMergeOp,
): ConfigMergeOp | undefined {
  const cf = entry?.configFiles?.find(c => sameDestination(c, op));
  return cf ? recordedOp(cf) : undefined;
}
