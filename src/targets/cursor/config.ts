/**
 * Cursor's config kinds as data (src/targets/config-kind-table.ts).
 *
 *   hook  project → .cursor/hooks.json at the project root (root: project)
 *         user    → .cursor/hooks.json under ~ (root: home)
 *         local   → refused: Cursor has no personal per-project hook file (use project or user)
 *
 * `CURSOR_CONFIG_KINDS` is the table the target dispatches every config install through;
 * destinationFor derives each refusal from it. The builder references stay inside arrow wrappers
 * because hook-ops.ts imports `resolveCursorConfigDestination` back from this module — a cycle
 * whose imported binding must only be read when an op is built, never while this module
 * initializes.
 *
 * CURSOR_HOOKS_DOC documents the file; CURSOR_THIRD_PARTY_HOOKS_DOC the Claude Code alias mapping
 * the hook writer translates. MCP (`.cursor/mcp.json`) comes in a later phase.
 *
 * @module
 */
import type { ConfigKind, ConfigRoot, ConfigScope } from '../../types';
import { destinationFor, type ConfigKindTable } from '../config-kind-table';
import { buildCursorHookOps, cursorHookSkipReason } from './hook-ops';

export interface CursorConfigDestination {
  file: string;
  root: ConfigRoot;
}

/** Cursor's config kinds: hooks today, with MCP joining the table in a later phase. */
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
};

export function resolveCursorConfigDestination(
  kind: ConfigKind,
  scope: ConfigScope,
): CursorConfigDestination {
  const { file, root } = destinationFor(CURSOR_CONFIG_KINDS, kind, scope, 'Cursor');
  return { file, root };
}
