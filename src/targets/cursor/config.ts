/**
 * Scope → destination resolver for Cursor config files.
 *
 *   hook  project → .cursor/hooks.json at the project root (root: project)
 *         user    → .cursor/hooks.json under ~ (root: home)
 *         local   → refused: Cursor has no personal per-project hook file (use project or user)
 *
 * CURSOR_HOOKS_DOC documents the file; CURSOR_THIRD_PARTY_HOOKS_DOC the Claude Code alias mapping
 * the hook writer translates. MCP (`.cursor/mcp.json`) comes in a later phase.
 *
 * @module
 */
import type { ConfigKind, ConfigRoot, ConfigScope } from '../../types';
import { SigilError } from '../../errors';

export interface CursorConfigDestination {
  file: string;
  root: ConfigRoot;
}

/** Both scopes write the same file, under the project root or the home directory. */
const HOOK_DESTINATIONS: Record<'project' | 'user', CursorConfigDestination> = {
  project: { file: '.cursor/hooks.json', root: 'project' },
  user: { file: '.cursor/hooks.json', root: 'home' },
};

export function resolveCursorConfigDestination(
  kind: ConfigKind,
  scope: ConfigScope,
): CursorConfigDestination {
  if (kind !== 'hook') {
    throw new SigilError(`Cursor supports only the 'hook' config kind, not '${kind}'.`);
  }
  if (scope === 'user') return HOOK_DESTINATIONS.user;
  if (scope === 'project') return HOOK_DESTINATIONS.project;
  throw new SigilError(
    `Cursor has no personal per-project ${kind} file — install at 'project' scope ` +
      `(${HOOK_DESTINATIONS.project.file}, git-committed) or 'user' scope ` +
      `(~/${HOOK_DESTINATIONS.user.file}, all projects).`,
  );
}
