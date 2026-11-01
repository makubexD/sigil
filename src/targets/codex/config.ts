/**
 * Scope → destination resolver for Codex config files.
 *
 *   hook  project → .codex/hooks.json at the project root (root: project)
 *         user    → hooks.json under $CODEX_HOME, default ~/.codex (root: codex-home)
 *         local   → refused: Codex has no personal per-project hook file (use project or user)
 *
 * @module
 */
import type { ConfigKind, ConfigRoot, ConfigScope } from '../../types';
import { SigilError } from '../../errors';

export interface CodexConfigDestination {
  file: string;
  root: ConfigRoot;
}

const PROJECT_HOOK: CodexConfigDestination = { file: '.codex/hooks.json', root: 'project' };
const USER_HOOK: CodexConfigDestination = { file: 'hooks.json', root: 'codex-home' };

export function resolveCodexConfigDestination(
  kind: ConfigKind,
  scope: ConfigScope,
): CodexConfigDestination {
  if (kind !== 'hook') {
    throw new SigilError(`Codex supports only the 'hook' config kind, not '${kind}'.`);
  }
  if (scope === 'user') return USER_HOOK;
  if (scope === 'project') return PROJECT_HOOK;
  throw new SigilError(
    `Codex has no personal per-project hook file — install at 'project' scope ` +
      `(.codex/hooks.json, git-committed) or 'user' scope ` +
      `($CODEX_HOME/hooks.json, default ~/.codex/hooks.json).`,
  );
}
