/**
 * Scope → destination resolver for Copilot / VS Code MCP config.
 *
 * VS Code MCP scopes:
 *   project/local → .vscode/mcp.json  (workspace scope — no distinct local; local aliases project)
 *   user          → mcp.json in VS Code user-profile dir (resolved by CLI as 'vscode-user' root)
 *
 * hook/settings are Claude Code-only; Copilot's capability table (./capabilities.ts) marks only
 * 'mcp' of the config kinds as supported.
 */
import type { ConfigScope, ConfigRoot } from '../../types';

export interface CopilotConfigDestination {
  file: string;
  root: ConfigRoot;
}

export function resolveCopilotConfigDestination(
  kind: 'mcp',
  scope: ConfigScope,
): CopilotConfigDestination {
  if (kind === 'mcp') {
    switch (scope) {
      case 'user':
        // VS Code user-profile mcp.json — root resolved by CLI to the platform-specific
        // VS Code User directory (best-effort; warns if absent).
        return { file: 'mcp.json', root: 'vscode-user' };
      default: // 'project' or 'local' both map to the workspace file (no VS Code local-mcp scope)
        return { file: '.vscode/mcp.json', root: 'project' };
    }
  }
  // Unreachable for other kinds (callers guard on the capability table via supportsKind)
  throw new Error(`resolveCopilotConfigDestination: unsupported kind '${kind}'`);
}
