/**
 * Scope → destination resolver for Codex config files.
 *
 *   hook  project → .codex/hooks.json at the project root (root: project)
 *         user    → hooks.json under $CODEX_HOME, default ~/.codex (root: codex-home)
 *         local   → refused: Codex has no personal per-project hook file (use project or user)
 *   mcp   project → .codex/config.toml at the project root (root: project)
 *         user    → config.toml under $CODEX_HOME, default ~/.codex (root: codex-home)
 *         local   → refused, as for hooks: no personal per-project MCP file
 *
 * @module
 */
import type { ConfigKind, ConfigRoot, ConfigScope } from '../../types';
import { SigilError } from '../../errors';

export interface CodexConfigDestination {
  file: string;
  root: ConfigRoot;
}

/** Per-kind project/user destinations; `local` has no Codex file for either kind. */
const DESTINATIONS: Record<
  'hook' | 'mcp',
  { project: CodexConfigDestination; user: CodexConfigDestination }
> = {
  hook: {
    project: { file: '.codex/hooks.json', root: 'project' },
    user: { file: 'hooks.json', root: 'codex-home' },
  },
  mcp: {
    project: { file: '.codex/config.toml', root: 'project' },
    user: { file: 'config.toml', root: 'codex-home' },
  },
};

export function resolveCodexConfigDestination(
  kind: ConfigKind,
  scope: ConfigScope,
): CodexConfigDestination {
  if (kind !== 'hook' && kind !== 'mcp') {
    throw new SigilError(`Codex supports only the 'hook' and 'mcp' config kinds, not '${kind}'.`);
  }
  const dest = DESTINATIONS[kind];
  if (scope === 'user') return dest.user;
  if (scope === 'project') return dest.project;
  throw new SigilError(
    `Codex has no personal per-project ${kind} file — install at 'project' scope ` +
      `(${dest.project.file}, git-committed) or 'user' scope ` +
      `($CODEX_HOME/${dest.user.file}, default ~/.codex/${dest.user.file}).`,
  );
}
