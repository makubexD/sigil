/**
 * ConfigMergeOp builder for Cursor `mcp` artifacts — the `mcpServers` map Cursor reads from
 * `.cursor/mcp.json` (project) and `~/.cursor/mcp.json` (user) (./config.ts; CURSOR_MCP_DOC).
 *
 * Cursor's `McpDialect` differs from the portable one in three values: `${env:NAME}` references
 * (CURSOR_MCP_DOC § Config interpolation), a `type: "stdio"` written first on a stdio server
 * (§ STDIO server configuration), and a `type` dropped from a remote one, whose transport the
 * examples leave undeclared. Interpolation covers `command`, `args`, `env`, `url` and `headers`
 * (probe A6 and § Phase D probes in docs/decisions/cursor-target-2026-11.md measured `${env:…}`
 * in `args` expanding).
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, ConfigScope } from '../../types';
import { destinationFor } from '../config-kind-table';
import { isMcpSkip, mcpServerOp, renderMcpServer } from '../mcp-dialect';
import type { McpDialect } from '../mcp-dialect';
import { CURSOR_CONFIG_KINDS } from './config';

/**
 * What `.cursor/mcp.json` expects of a catalog server (CURSOR_MCP_DOC). The table is a value, not
 * a code path: `renderMcpServer` (../mcp-dialect.ts) does the render.
 */
export const CURSOR_MCP_DIALECT: McpDialect = {
  serversKey: 'mcpServers',
  envSyntax: { format: name => '${env:' + name + '}' },
  interpolatedFields: ['command', 'args', 'env', 'url', 'headers'],
  stdioType: 'stdio',
  remoteType: 'drop',
};

/**
 * Why Cursor cannot render this server, or undefined when it can — the destination refusal for a
 * scope is separate (`buildCursorMcpOps` throws it). Read by `configSkipReason` so an
 * unrenderable server is skipped with its reason rather than failing the install.
 */
export function cursorMcpSkipReason(artifact: Artifact): string | undefined {
  const rendered = renderMcpServer(artifact, CURSOR_MCP_DIALECT);
  return isMcpSkip(rendered) ? rendered.skip : undefined;
}

/** One object-spread op on `mcpServers` in the scope's Cursor MCP file (./config.ts). */
export function buildCursorMcpOps(artifact: Artifact, scope: ConfigScope): ConfigMergeOp[] {
  return [
    mcpServerOp(
      artifact,
      CURSOR_MCP_DIALECT,
      destinationFor(CURSOR_CONFIG_KINDS, 'mcp', scope, 'Cursor'),
    ),
  ];
}
