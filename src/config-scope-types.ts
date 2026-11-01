/**
 * Provider-declared config-scope descriptors: the scope options a target offers for config-kind
 * installs and the file each one writes. Re-exported from src/types.ts, the place to import them.
 *
 * @module
 */
import type { ConfigKind, ConfigRoot, ConfigScope } from './types';

/**
 * One concrete file destination for a (scope, kind) pair, with the absolute path pre-resolved.
 * Produced by Target.configScopes() so the wizard and CLI never need to hardcode paths.
 */
export interface ConfigScopeDestination {
  kind: ConfigKind;
  /** Relative path inside the resolved root (e.g. '.claude/settings.local.json'). */
  file: string;
  root: ConfigRoot;
  /** Absolute path, already resolved for the given projectDir. Display-ready for the user. */
  fullPath: string;
  /**
   * Human-readable JSON key-path where the fragment lands INSIDE the file, using ' › ' as
   * separator (e.g. 'projects › /abs/proj › mcpServers', or 'mcpServers'). Present only when
   * the fragment nests below the file root — used to disambiguate scopes that share a file.
   * Classic case: Claude mcp 'local' and 'user' both write ~/.claude.json, but 'local' goes
   * under projects.<dir>.mcpServers while 'user' goes under the top-level mcpServers key.
   * Undefined means the fragment merges at the file root (settings, hook, etc.).
   */
  section?: string | undefined;
}

/**
 * A scope option a target offers for config-kind installs.
 * Targets return an array of these from configScopes(), ordered by documented precedence
 * (highest-priority scope first). The wizard renders each as a select option whose hint
 * shows the full absolute path(s) so users know exactly where each scope writes.
 */
export interface ConfigScopeInfo {
  /** CLI flag value and internal state key. */
  value: ConfigScope;
  /** Display label shown in the wizard select. */
  label: string;
  /**
   * Priority rank per the platform's documentation, 1 = highest priority.
   * Used to sort the menu (ascending) and annotate the label.
   */
  precedence: number;
  /** True when the file is git-committed and shared with collaborators. */
  shared: boolean;
  /**
   * 'project' — write only affects this repository.
   * 'all-projects' — write affects ALL user projects (home-dir or user-profile file).
   * Drives the blast-radius warning shown before confirming user-scope installs.
   */
  blastRadius: 'project' | 'all-projects';
  /** Short human-readable note shown alongside the full path hint. */
  description: string;
  /** Pre-resolved destination for each config kind in the current selection. */
  destinations: ConfigScopeDestination[];
}
