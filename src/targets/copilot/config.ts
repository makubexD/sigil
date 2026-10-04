/**
 * Scope → destination resolver for Copilot MCP config, in the portable format (./mcp-key.ts):
 *   project/local → .mcp.json at the project root (Copilot has no distinct local scope)
 *   user          → mcp-config.json under $COPILOT_HOME, default ~/.copilot (root: copilot-home)
 *
 * hook/settings are Claude Code-only; Copilot's capability table (./capabilities.ts) marks only
 * 'mcp' of the config kinds as supported.
 */
import type { ConfigScope, ConfigRoot, RetiredConfigDestination } from '../../types';
import { COPILOT_PROJECT_MCP_FILE, COPILOT_USER_MCP_FILE } from './mcp-key';

export interface CopilotConfigDestination {
  file: string;
  root: ConfigRoot;
}

const PROJECT_MCP: CopilotConfigDestination = { file: COPILOT_PROJECT_MCP_FILE, root: 'project' };
const USER_MCP: CopilotConfigDestination = { file: COPILOT_USER_MCP_FILE, root: 'copilot-home' };

export function resolveCopilotConfigDestination(
  kind: 'mcp',
  scope: ConfigScope,
): CopilotConfigDestination {
  if (kind === 'mcp') return scope === 'user' ? USER_MCP : PROJECT_MCP;
  // Unreachable for other kinds (callers guard on the capability table via supportsKind)
  throw new Error(`resolveCopilotConfigDestination: unsupported kind '${kind}'`);
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
