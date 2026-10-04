/**
 * Where Copilot reads MCP servers: the portable format, which VS Code recommends for new servers and
 * Copilot CLI and VS Code's Agent Host read directly (VSCODE_MCP_DOC, COPILOT_CLI_MCP_DOC). Servers
 * sit under `mcpServers` in `.mcp.json` at the project root, or in `mcp-config.json` under
 * `$COPILOT_HOME` (default `~/.copilot`) for the user. VS Code's own `.vscode/mcp.json` and
 * user-profile `mcp.json` are deprecated; see COPILOT_RETIRED_MCP_DESTINATIONS (./config.ts).
 *
 * @module
 */
import { PORTABLE_MCP_SERVERS_KEY } from '../portable-mcp';

/** The JSON key that holds MCP servers in the portable format. */
export const COPILOT_MCP_SERVERS_KEY = PORTABLE_MCP_SERVERS_KEY;

/** The project-level portable MCP file. */
export const COPILOT_PROJECT_MCP_FILE = '.mcp.json';

/** The user-level portable MCP file, under the `copilot-home` root. */
export const COPILOT_USER_MCP_FILE = 'mcp-config.json';
