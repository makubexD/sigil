/**
 * Environment-variable references in MCP server config. A catalog `mcp` artifact writes the
 * neutral token `{sigil:env:NAME}`; each target expands it into the syntax of the file it writes
 * (an `EnvSyntax`, data on the target), so no catalog value carries one provider's syntax and a
 * new target supplies one value instead of a code path. MCP config is merged as JSON, not rendered
 * through renderArtifact, so the body lexicon never reaches it.
 *
 * @module
 */
import { SigilError } from '../errors';

/**
 * `${NAME}` — the syntax of the portable `.mcp.json` (`mcpServers`), the file Claude Code reads and
 * Copilot CLI shares, and of Claude Code's other MCP files. Claude Code documents the expansion;
 * Copilot CLI's reading of it in the shared file is not documented (see the catalog layout ADR).
 */
export const PORTABLE_MCP_ENV_SYNTAX: EnvSyntax = {
  format: name => '${' + name + '}', // documented in CLAUDE_MCP_DOC (doc-refs.ts)
};

/** How one config file references an environment variable. */
export interface EnvSyntax {
  readonly format: (name: string) => string;
}

const ENV_TOKEN_RE = /\{sigil:env:([^}]*)\}/g;
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function expandString(value: string, syntax: EnvSyntax): string {
  return value.replace(ENV_TOKEN_RE, (token, name: string) => {
    if (!ENV_NAME_RE.test(name)) {
      throw new SigilError(
        `Malformed ${token} in an MCP config: an environment variable name is letters, digits and _`,
      );
    }
    return syntax.format(name);
  });
}

/** Expands every `{sigil:env:NAME}` token in `value`'s strings, at any depth; other values pass. */
export function expandEnvTokens<T>(value: T, syntax: EnvSyntax): T {
  if (typeof value === 'string') return expandString(value, syntax) as T;
  if (Array.isArray(value)) return value.map(item => expandEnvTokens(item, syntax)) as T;
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, expandEnvTokens(item, syntax)]),
  ) as T;
}
