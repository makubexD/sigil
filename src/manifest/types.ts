/**
 * Schema types and constants for the install manifest.
 */

export const MANIFEST_VERSION = 2;
export const MANIFEST_RELATIVE_PATH = '.sigil/manifest.json';

/** SHA-256 hex digest of a single installed file. */
export interface ManifestFile {
  path: string; // relative to projectDir, e.g. ".claude/agents/code-reviewer.md"
  sha256: string;
}

/**
 * Partial-ownership record for a config-kind artifact (hook, settings, mcp).
 * Sigil owns only `fragment` inside the user-owned JSON file.
 * The fragment is stored as-installed so it can be reversed without re-reading the catalog.
 */
export interface ManifestConfigMerge {
  /** Relative path of the JSON file sigil contributes to (e.g. ".claude/settings.json"). */
  file: string;
  /**
   * Symbolic root the CLI resolves to an absolute directory before joining `file`.
   * Defaults to 'project' when absent (backward-compatible with v2 entries).
   */
  root?: string;
  /** The JSON sub-tree sigil contributed at install time. Used for drift detection + reversal. */
  fragment: Record<string, unknown>;
  /** Per top-level key merge strategy (same shape as ConfigMergeOp.strategy). */
  strategy: Record<string, string>;
  /** SHA-256 of canonicalized(fragment) at install time. Quick drift check. */
  fragmentSha256: string;
}

/** Record for one installed artifact (primary pick or dependency). */
export interface ManifestEntry {
  id: string;
  kind: string;
  target: string; // platform adapter name, e.g. "claude" | "copilot"
  sigilVersion: string; // pkg.version at install time
  /** Whole-file records — set for whole-file kinds (skill, agent, rule, prompt, workflow). */
  files: ManifestFile[];
  /**
   * Partial-ownership records — set for config kinds (hook, settings, mcp).
   * Each entry describes one JSON file sigil contributes to.
   */
  configFiles?: ManifestConfigMerge[];
  /** IDs of primary picks that pulled this in via `uses:`. Empty for direct picks. */
  dependentOf: string[];
  installedAt: string; // ISO timestamp (stamped by CLI layer)
  /**
   * The `template:` this artifact composed against at install/update time, and that template's
   * `revision:` then. Absent for untemplated artifacts and for entries recorded before this field
   * existed (additive — no MANIFEST_VERSION bump). Lets `status` name *why* something is outdated
   * (`template workflow-skill rev 2→3`) instead of a bare `outdated`, by comparing against the
   * bundled catalog's current revision for the same template id.
   */
  template?: { id: string; revision: number } | undefined;
}

export interface Manifest {
  manifestVersion: number;
  entries: ManifestEntry[];
}

/** Health status of a single installed artifact. */
export type ArtifactStatus =
  | 'up-to-date' // hashes match and id still in catalog
  | 'outdated' // id in catalog but scaffold output differs from recorded hashes
  | 'drifted' // at least one file's on-disk content differs from recorded hash
  | 'orphaned' // id no longer exists in the bundled catalog
  | 'missing'; // at least one recorded file is absent from disk

export interface StatusResult {
  entry: ManifestEntry;
  status: ArtifactStatus;
  /** Files whose on-disk content doesn't match the recorded hash. */
  driftedFiles: string[];
  /** Files that no longer exist on disk. */
  missingFiles: string[];
  /** Short human-readable explanation of `status`. Absent for 'up-to-date'. */
  reason?: string;
}
