import type { EnvSyntax } from '../env-reference';
import { VSCODE_VARIABLES_DOC } from '../doc-refs';

/**
 * JSON section key where GitHub Copilot stores MCP server configs.
 * Copilot uses `servers` (not `mcpServers` which is the Claude Code convention).
 */
export const COPILOT_MCP_SERVERS_KEY = 'servers';

/**
 * Copilot CLI reads project MCP servers from `.mcp.json` under `mcpServers` — never from VS Code's
 * `.vscode/mcp.json` (docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/
 * add-mcp-servers). A project-scope Copilot install writes both files so the server reaches VS Code
 * and the CLI; the 2026-09-27 live-prompt campaign found the CLI never loaded it otherwise.
 */
export const COPILOT_CLI_MCP_FILE = '.mcp.json';
export const COPILOT_CLI_MCP_SERVERS_KEY = 'mcpServers';

/** `${env:NAME}` — how VS Code's mcp.json files reference an environment variable. */
export const VSCODE_MCP_ENV_SYNTAX: EnvSyntax = {
  format: name => '${env:' + name + '}',
  doc: VSCODE_VARIABLES_DOC,
};
