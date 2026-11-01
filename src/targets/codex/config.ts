/**
 * Codex's config kinds as data (src/targets/config-kind-table.ts).
 *
 *   hook  project → .codex/hooks.json at the project root (root: project)
 *         user    → hooks.json under $CODEX_HOME, default ~/.codex (root: codex-home)
 *         local   → refused: Codex has no personal per-project hook file (use project or user)
 *   mcp   project → .codex/config.toml at the project root (root: project)
 *         user    → config.toml under $CODEX_HOME, default ~/.codex (root: codex-home)
 *         local   → refused, as for hooks: no personal per-project MCP file
 *
 * `CODEX_CONFIG_KINDS` is the table the target dispatches every config install through;
 * destinationFor derives each refusal from it. The builder references stay inside arrow wrappers
 * because hook-ops.ts / mcp-ops.ts import `resolveCodexConfigDestination` back from this module —
 * a cycle whose imported binding must only be read when an op is built, never while this module
 * initializes.
 *
 * @module
 */
import type { ConfigKind, ConfigRoot, ConfigScope } from '../../types';
import { destinationFor, type ConfigKindTable } from '../config-kind-table';
import { buildCodexHookOps } from './hook-ops';
import { buildCodexMcpOps } from './mcp-ops';

export interface CodexConfigDestination {
  file: string;
  root: ConfigRoot;
}

/** Codex's config kinds: hooks and MCP servers, each with a project and a $CODEX_HOME file. */
export const CODEX_CONFIG_KINDS: ConfigKindTable = {
  hook: {
    section: 'hooks',
    destinations: {
      project: {
        file: '.codex/hooks.json',
        root: 'project',
        display: '.codex/hooks.json, git-committed',
      },
      user: {
        file: 'hooks.json',
        root: 'codex-home',
        display: '$CODEX_HOME/hooks.json, default ~/.codex/hooks.json',
      },
    },
    buildOps: (artifact, scope) => buildCodexHookOps(artifact, scope),
  },
  mcp: {
    section: 'mcp_servers',
    destinations: {
      project: {
        file: '.codex/config.toml',
        root: 'project',
        display: '.codex/config.toml, git-committed',
      },
      user: {
        file: 'config.toml',
        root: 'codex-home',
        display: '$CODEX_HOME/config.toml, default ~/.codex/config.toml',
      },
    },
    buildOps: (artifact, scope) => buildCodexMcpOps(artifact, scope),
  },
};

export function resolveCodexConfigDestination(
  kind: ConfigKind,
  scope: ConfigScope,
): CodexConfigDestination {
  const { file, root } = destinationFor(CODEX_CONFIG_KINDS, kind, scope, 'Codex');
  return { file, root };
}
