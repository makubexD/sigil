/**
 * ConfigMergeOp builder for OpenCode `mcp` artifacts — the `mcp` map OpenCode reads from
 * `.opencode/opencode.json` (project) and `$XDG_CONFIG_HOME/opencode/opencode.json` (user)
 * (./config.ts; OPENCODE_MCP_DOC).
 *
 * OpenCode's `McpDialect` differs from the portable one in its values (OPENCODE_MCP_DOC): the
 * servers sit under `mcp`, a stdio server is `type: "local"` with `command` folded from the
 * authored `command` plus `args`, its `env` is written as `environment`, and a remote server is
 * `type: "remote"` with `url` and `headers`. Environment references use `{env:NAME}`
 * (OPENCODE_CONFIG_DOC). Interpolation covers `command`, `args`, `env`, `url` and `headers`, since
 * OpenCode expands references across the config file (OPENCODE_CONFIG_DOC).
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, ConfigScope } from '../../types';
import { destinationFor } from '../config-kind-table';
import { isMcpSkip, mcpServerOp, renderMcpServer } from '../mcp-dialect';
import type { McpDialect } from '../mcp-dialect';
import { OPENCODE_CONFIG_KINDS } from './config';

/**
 * What OpenCode's `mcp` map expects of a catalog server (OPENCODE_MCP_DOC). The table is a value,
 * not a code path: `renderMcpServer` (../mcp-dialect.ts) does the render.
 */
export const OPENCODE_MCP_DIALECT: McpDialect = {
  serversKey: 'mcp',
  envSyntax: { format: name => '{env:' + name + '}' },
  interpolatedFields: ['command', 'args', 'env', 'url', 'headers'],
  envKey: 'environment',
  commandForm: 'array',
  stdioType: 'local',
  remoteType: { set: 'remote' },
};

/**
 * Why OpenCode cannot render this server, or undefined when it can — the destination refusal for a
 * scope is separate (`buildOpenCodeMcpOps` throws it). Read by `configSkipReason` so an
 * unrenderable server is skipped with its reason rather than failing the install.
 */
export function openCodeMcpSkipReason(artifact: Artifact): string | undefined {
  const rendered = renderMcpServer(artifact, OPENCODE_MCP_DIALECT);
  return isMcpSkip(rendered) ? rendered.skip : undefined;
}

/** One object-spread op on `mcp` in the scope's OpenCode config file (./config.ts). */
export function buildOpenCodeMcpOps(artifact: Artifact, scope: ConfigScope): ConfigMergeOp[] {
  return [
    mcpServerOp(
      artifact,
      OPENCODE_MCP_DIALECT,
      destinationFor(OPENCODE_CONFIG_KINDS, 'mcp', scope, 'OpenCode'),
    ),
  ];
}
