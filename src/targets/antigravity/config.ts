/**
 * Antigravity's config kinds as data (src/targets/config-kind-table.ts).
 *
 *   hook  project → .agents/hooks.json at the project root (root: project)
 *         user    → .gemini/config/hooks.json under ~ (root: home)
 *         local   → refused: Antigravity has no personal per-project hook file (use project or user)
 *
 *   mcp   project → .agents/mcp_config.json at the project root (root: project)
 *         user    → .gemini/config/mcp_config.json under ~ (root: home)
 *         local   → refused: Antigravity has no personal per-project MCP file (use project or user)
 *
 * `ANTIGRAVITY_CONFIG_KINDS` is the table the target dispatches every config install through;
 * destinationFor derives each refusal from it. The builder references stay inside arrow wrappers
 * because hook-ops.ts and mcp-ops.ts import `ANTIGRAVITY_CONFIG_KINDS` back from this module — a
 * cycle whose imported binding must only be read when an op is built, never while this module
 * initializes.
 *
 * ANTIGRAVITY_HOOKS_DOC documents the hook files; ANTIGRAVITY_MCP_DOC the MCP files;
 * ANTIGRAVITY_SETTINGS_DOC how a server present in both files is resolved.
 *
 * @module
 */
import type { ConfigKind, ConfigRoot, ConfigScope } from '../../types';
import { destinationFor, type ConfigKindTable } from '../config-kind-table';
import { antigravityHookSkipReason, buildAntigravityHookOps } from './hook-ops';
import { antigravityMcpSkipReason, buildAntigravityMcpOps } from './mcp-ops';

export interface AntigravityConfigDestination {
  file: string;
  root: ConfigRoot;
}

/** Antigravity's config kinds: hooks in `.agents/hooks.json`, MCP in `.agents/mcp_config.json`. */
export const ANTIGRAVITY_CONFIG_KINDS: ConfigKindTable = {
  hook: {
    section: '(hook name)',
    destinations: {
      project: {
        file: '.agents/hooks.json',
        root: 'project',
        display: '.agents/hooks.json, git-committed',
      },
      user: {
        file: '.gemini/config/hooks.json',
        root: 'home',
        display: '~/.gemini/config/hooks.json, all projects',
      },
    },
    buildOps: (artifact, scope) => buildAntigravityHookOps(artifact, scope),
    skipReason: artifact => antigravityHookSkipReason(artifact),
  },
  mcp: {
    section: 'mcpServers',
    destinations: {
      project: {
        file: '.agents/mcp_config.json',
        root: 'project',
        display: '.agents/mcp_config.json, git-committed',
      },
      user: {
        file: '.gemini/config/mcp_config.json',
        root: 'home',
        display: '~/.gemini/config/mcp_config.json, all projects',
      },
    },
    buildOps: (artifact, scope) => buildAntigravityMcpOps(artifact, scope),
    skipReason: artifact => antigravityMcpSkipReason(artifact),
  },
};

export function resolveAntigravityConfigDestination(
  kind: ConfigKind,
  scope: ConfigScope,
): AntigravityConfigDestination {
  const { file, root } = destinationFor(ANTIGRAVITY_CONFIG_KINDS, kind, scope, 'Antigravity');
  return { file, root };
}
