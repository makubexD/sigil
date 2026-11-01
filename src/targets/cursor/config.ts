/**
 * Cursor's config kinds as data (src/targets/config-kind-table.ts).
 *
 *   hook  project → .cursor/hooks.json at the project root (root: project)
 *         user    → .cursor/hooks.json under ~ (root: home)
 *         local   → refused: Cursor has no personal per-project hook file (use project or user)
 *
 *   mcp   project → .cursor/mcp.json at the project root (root: project)
 *         user    → .cursor/mcp.json under ~ (root: home)
 *         local   → refused: Cursor has no personal per-project MCP file (use project or user)
 *
 * `CURSOR_CONFIG_KINDS` is the table the target dispatches every config install through;
 * destinationFor derives each refusal from it. The builder references stay inside arrow wrappers
 * because hook-ops.ts and mcp-ops.ts import `CURSOR_CONFIG_KINDS` back from this module — a cycle
 * whose imported binding must only be read when an op is built, never while this module
 * initializes.
 *
 * CURSOR_HOOKS_DOC documents the hook file; CURSOR_THIRD_PARTY_HOOKS_DOC the Claude Code alias
 * mapping the hook writer translates; CURSOR_MCP_DOC the MCP file.
 *
 * @module
 */
import type { ConfigKind, ConfigRoot, ConfigScope } from '../../types';
import { destinationFor, type ConfigKindTable } from '../config-kind-table';
import { buildCursorHookOps, cursorHookSkipReason } from './hook-ops';
import { buildCursorMcpOps, cursorMcpSkipReason } from './mcp-ops';

export interface CursorConfigDestination {
  file: string;
  root: ConfigRoot;
}

/** Cursor's config kinds: hooks in `.cursor/hooks.json`, MCP servers in `.cursor/mcp.json`. */
export const CURSOR_CONFIG_KINDS: ConfigKindTable = {
  hook: {
    section: 'hooks',
    destinations: {
      project: {
        file: '.cursor/hooks.json',
        root: 'project',
        display: '.cursor/hooks.json, git-committed',
      },
      user: {
        file: '.cursor/hooks.json',
        root: 'home',
        display: '~/.cursor/hooks.json, all projects',
      },
    },
    buildOps: (artifact, scope) => buildCursorHookOps(artifact, scope),
    skipReason: artifact => cursorHookSkipReason(artifact),
  },
  mcp: {
    section: 'mcpServers',
    destinations: {
      project: {
        file: '.cursor/mcp.json',
        root: 'project',
        display: '.cursor/mcp.json, git-committed',
      },
      user: {
        file: '.cursor/mcp.json',
        root: 'home',
        display: '~/.cursor/mcp.json, all projects',
      },
    },
    buildOps: (artifact, scope) => buildCursorMcpOps(artifact, scope),
    skipReason: artifact => cursorMcpSkipReason(artifact),
  },
};

export function resolveCursorConfigDestination(
  kind: ConfigKind,
  scope: ConfigScope,
): CursorConfigDestination {
  const { file, root } = destinationFor(CURSOR_CONFIG_KINDS, kind, scope, 'Cursor');
  return { file, root };
}
