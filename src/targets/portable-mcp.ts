/**
 * The portable MCP server entry: `mcpServers.<name>` with `{sigil:env:NAME}` written as `${NAME}`,
 * the format Claude Code's `.mcp.json` and Copilot's portable files share. Every target that writes
 * this format builds its op here, so two targets writing the same `.mcp.json` produce
 * byte-identical fragments (uninstall's shared-fragment check depends on it).
 *
 * This file is now a thin wrapper: the transform lives in `McpDialect` (./mcp-dialect.ts), and the
 * portable format is the one value `PORTABLE_MCP_DIALECT`. The exported names keep their signatures
 * so the three callers that already build portable entries (Claude's scaffold, Copilot's scaffold,
 * and the generated Claude plugin) compile unchanged.
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, ConfigRoot } from '../types';
import { PORTABLE_MCP_ENV_SYNTAX } from './env-reference';
import { isMcpSkip, mcpServerOp, renderMcpServer } from './mcp-dialect';
import type { McpDialect } from './mcp-dialect';

/** What the builder reads from an mcp artifact. */
type McpSource = Pick<Artifact, 'id' | 'frontmatter'>;

/** The JSON key that holds MCP servers in the portable format. */
export const PORTABLE_MCP_SERVERS_KEY = 'mcpServers';

/**
 * The portable `.mcp.json` dialect: `mcpServers`, `${NAME}` expansion, every field interpolated,
 * and the authored object untouched (`type` is `'http'`/`'sse'` on a remote server, never added
 * on stdio and never dropped on remote).
 */
export const PORTABLE_MCP_DIALECT: McpDialect = {
  serversKey: PORTABLE_MCP_SERVERS_KEY,
  envSyntax: PORTABLE_MCP_ENV_SYNTAX,
  interpolatedFields: ['command', 'args', 'env', 'url', 'headers'],
  remoteType: 'keep',
};

/** An mcp artifact's server name and its config as written to a portable file. */
export function portableMcpServer(artifact: McpSource): {
  name: string;
  config: Record<string, unknown>;
} {
  const rendered = renderMcpServer(artifact, PORTABLE_MCP_DIALECT);
  // Cannot happen: every server field is interpolated, so only a token in a non-McpField key
  // (e.g. a hand-authored `cwd`) would skip — and that is a catalog error to surface, not hide.
  if (isMcpSkip(rendered)) {
    throw new Error(`portable MCP dialect must not skip a server: ${rendered.skip}`);
  }
  return rendered;
}

/** The op that merges `artifact`'s server into the portable file `dest`. */
export function portableMcpOp(
  artifact: McpSource,
  dest: { file: string; root: ConfigRoot },
): ConfigMergeOp {
  return mcpServerOp(artifact, PORTABLE_MCP_DIALECT, dest);
}
