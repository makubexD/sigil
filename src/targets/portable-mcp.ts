/**
 * The portable MCP server entry: `mcpServers.<name>` with `{sigil:env:NAME}` written as `${NAME}`,
 * the format Claude Code's `.mcp.json` and Copilot's portable files share. Every target that writes
 * this format builds its op here, so two targets writing the same `.mcp.json` produce
 * byte-identical fragments (uninstall's shared-fragment check depends on it).
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, ConfigRoot } from '../types';
import { basenameOfId } from '../paths';
import { expandEnvTokens, PORTABLE_MCP_ENV_SYNTAX } from './env-reference';

/** What the builder reads from an mcp artifact. */
type McpSource = Pick<Artifact, 'id' | 'frontmatter'>;

/** The JSON key that holds MCP servers in the portable format. */
export const PORTABLE_MCP_SERVERS_KEY = 'mcpServers';

/** An mcp artifact's server name and its config as written to a portable file. */
export function portableMcpServer(artifact: McpSource): {
  name: string;
  config: Record<string, unknown>;
} {
  const fm = artifact.frontmatter;
  const name = (fm.name as string | undefined) ?? basenameOfId(artifact.id);
  // `description` is catalog-only documentation, never written to the provider's file.
  const { description: _d, ...authored } = fm.server as Record<string, unknown>;
  void _d;
  return { name, config: expandEnvTokens(authored, PORTABLE_MCP_ENV_SYNTAX) };
}

/** The op that merges `artifact`'s server into the portable file `dest`. */
export function portableMcpOp(
  artifact: McpSource,
  dest: { file: string; root: ConfigRoot },
): ConfigMergeOp {
  const { name, config } = portableMcpServer(artifact);
  const key = PORTABLE_MCP_SERVERS_KEY;
  return {
    file: dest.file,
    root: dest.root,
    fragment: { [key]: { [name]: config } },
    strategy: { [key]: 'object-spread' },
    section: key,
  };
}
