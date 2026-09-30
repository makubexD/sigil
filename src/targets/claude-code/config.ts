/**
 * Scope → destination resolver for Claude Code config artifacts.
 *
 * Pure table-driven logic — no I/O, no side effects.
 * Tested directly in unit tests.
 */
import type { ConfigScope, ConfigRoot } from '../../types';

// ─── File and section-key constants ───────────────────────────────────────────

/** The per-user / per-project-local Claude config file (lives in ~/ or home root). */
export const CLAUDE_JSON_FILE = '.claude.json';

/** The project-scoped MCP server list file. */
export const PROJECT_MCP_FILE = '.mcp.json';

/** The project-scoped Claude settings file (checked into the repo). */
export const PROJECT_SETTINGS_FILE = '.claude/settings.json';

/** The local (machine-only) Claude settings file (git-ignored). */
export const LOCAL_SETTINGS_FILE = '.claude/settings.local.json';

/**
 * JSON section key where Claude Code (user/project scopes) stores MCP server configs.
 * Used in fragment wrappers and display paths.
 */
export const CLAUDE_MCP_SERVERS_KEY = 'mcpServers';

/**
 * Resolved destination for a config-kind artifact.
 *
 * For mcp-local: `wrapPath` is the key sequence to nest the server map inside, e.g.
 *   wrapPath = ['projects', '/abs/project/path']
 *   → fragment becomes { projects: { [absPath]: { mcpServers: {…} } } }
 * This lets applyMerge/reverseMerge/detectConfigDrift work without special-casing.
 */
export interface ConfigDestination {
  file: string;
  root: ConfigRoot;
  /** If set, the adapter wraps the inner fragment under this key path before returning the op. */
  wrapPath?: string[];
}

/**
 * Maps a (kind, scope) pair to the concrete file and symbolic root for Claude Code.
 *
 * Scope tables (docs-accurate, from code.claude.com/docs/en/settings):
 *
 * | Scope   | settings / hook               | mcp                                |
 * |---------|-------------------------------|-------------------------------------|
 * | local   | .claude/settings.local.json   | ~/.claude.json (per-project key)   |
 * | project | .claude/settings.json         | .mcp.json                          |
 * | user    | ~/.claude/settings.json       | ~/.claude.json                     |
 */
export function resolveClaudeConfigDestination(
  kind: 'hook' | 'settings' | 'mcp',
  scope: ConfigScope,
  projectDir: string,
): ConfigDestination {
  if (kind === 'hook' || kind === 'settings') {
    switch (scope) {
      case 'local':
        return { file: LOCAL_SETTINGS_FILE, root: 'project' };
      case 'user':
        return { file: PROJECT_SETTINGS_FILE, root: 'home' };
      default: // 'project'
        return { file: PROJECT_SETTINGS_FILE, root: 'project' };
    }
  }

  // kind === 'mcp'
  switch (scope) {
    case 'local':
      return { file: CLAUDE_JSON_FILE, root: 'home', wrapPath: ['projects', projectDir] };
    case 'user':
      return { file: CLAUDE_JSON_FILE, root: 'home' };
    default: // 'project'
      return { file: PROJECT_MCP_FILE, root: 'project' };
  }
}
