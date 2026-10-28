/**
 * Scope → destination resolver for Copilot config files.
 *
 *   mcp   project/local → .mcp.json at the project root (Copilot has no distinct local MCP scope)
 *         user          → mcp-config.json under $COPILOT_HOME, default ~/.copilot (root: copilot-home)
 *   hook  project → .github/hooks/sigil.json (root: project)
 *         local   → .github/copilot/settings.local.json (root: project)
 *         user    → hooks/sigil.json under $COPILOT_HOME, default ~/.copilot (root: copilot-home)
 *
 * settings stays Claude Code-only; Copilot's capability table (./capabilities.ts) marks 'mcp' and
 * 'hook' as supported.
 */
import type { ConfigScope, ConfigRoot, RetiredConfigDestination } from '../../types';
import { COPILOT_PROJECT_MCP_FILE, COPILOT_USER_MCP_FILE } from './mcp-key';

export interface CopilotConfigDestination {
  file: string;
  root: ConfigRoot;
}

const PROJECT_MCP: CopilotConfigDestination = { file: COPILOT_PROJECT_MCP_FILE, root: 'project' };
const USER_MCP: CopilotConfigDestination = { file: COPILOT_USER_MCP_FILE, root: 'copilot-home' };

const PROJECT_HOOK: CopilotConfigDestination = {
  file: '.github/hooks/sigil.json',
  root: 'project',
};
const LOCAL_HOOK: CopilotConfigDestination = {
  file: '.github/copilot/settings.local.json',
  root: 'project',
};
const USER_HOOK: CopilotConfigDestination = { file: 'hooks/sigil.json', root: 'copilot-home' };

export function resolveCopilotConfigDestination(
  kind: 'mcp' | 'hook',
  scope: ConfigScope,
): CopilotConfigDestination {
  if (kind === 'hook') {
    if (scope === 'user') return USER_HOOK;
    if (scope === 'local') return LOCAL_HOOK;
    return PROJECT_HOOK;
  }
  return scope === 'user' ? USER_MCP : PROJECT_MCP;
}

/**
 * VS Code's own MCP files, which VS Code now lists as deprecated in favour of the portable ones
 * (VSCODE_MCP_DOC). Installs made before the move recorded these; `sigil update` moves each
 * recorded server to its portable file and takes it out of the old one.
 */
export const COPILOT_RETIRED_MCP_DESTINATIONS: readonly RetiredConfigDestination[] = [
  { from: { file: '.vscode/mcp.json', root: 'project' }, to: PROJECT_MCP },
  { from: { file: 'mcp.json', root: 'vscode-user' }, to: USER_MCP },
];
