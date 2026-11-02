/**
 * ConfigMergeOp builder for Antigravity `mcp` artifacts — the `mcpServers` map Antigravity reads
 * from `.agents/mcp_config.json` (project) and `~/.gemini/config/mcp_config.json` (user)
 * (./config.ts; ANTIGRAVITY_MCP_DOC).
 *
 * Antigravity's `McpDialect` differs from the portable one in two values: `envSyntax:
 * 'inherited'`, because neither file expands environment references and the server inherits
 * `agy`'s environment instead (P5 and C1 in docs/decisions/antigravity-target-2026-11.md), and no
 * `type` anywhere: the documented stdio entry is `command` + `args` + `env` + `cwd`, the remote one
 * `serverUrl` or `url` + `headers` (ANTIGRAVITY_MCP_DOC). An identity env entry
 * (`NAME: '{sigil:env:NAME}'`) is dropped — the server already sees `NAME` — and any other token
 * skips the server.
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, ConfigScope } from '../../types';
import { destinationFor } from '../config-kind-table';
import { isMcpSkip, mcpServerOp, renderMcpServer } from '../mcp-dialect';
import type { McpDialect } from '../mcp-dialect';
import { ANTIGRAVITY_CONFIG_KINDS } from './config';

/**
 * What Antigravity's MCP files expect of a catalog server (ANTIGRAVITY_MCP_DOC). The table is a
 * value, not a code path: `renderMcpServer` (../mcp-dialect.ts) does the render.
 */
export const ANTIGRAVITY_MCP_DIALECT: McpDialect<'inherited'> = {
  serversKey: 'mcpServers',
  envSyntax: 'inherited',
  interpolatedFields: [],
  remoteType: 'drop',
};

/**
 * Why Antigravity cannot render this server, or undefined when it can — the destination refusal
 * for a scope is separate (`buildAntigravityMcpOps` throws it). Read by `configSkipReason` so an
 * unrenderable server is skipped with its reason rather than failing the install.
 */
export function antigravityMcpSkipReason(artifact: Artifact): string | undefined {
  const rendered = renderMcpServer(artifact, ANTIGRAVITY_MCP_DIALECT);
  return isMcpSkip(rendered) ? rendered.skip : undefined;
}

/** One object-spread op on `mcpServers` in the scope's Antigravity MCP file (./config.ts). */
export function buildAntigravityMcpOps(artifact: Artifact, scope: ConfigScope): ConfigMergeOp[] {
  return [
    mcpServerOp(
      artifact,
      ANTIGRAVITY_MCP_DIALECT,
      destinationFor(ANTIGRAVITY_CONFIG_KINDS, 'mcp', scope, 'Antigravity'),
    ),
  ];
}
