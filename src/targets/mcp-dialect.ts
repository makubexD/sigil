/**
 * What one target's MCP file expects, given as data. A catalog `mcp` artifact authors a
 * provider-neutral server (`server:`) with `{sigil:env:NAME}` tokens; each target turns it into
 * the file it writes through one `McpDialect` value instead of a hand-rolled builder: which JSON
 * key servers sit under, how env tokens are expanded, which fields may carry a token, and the
 * `type` policy for stdio and remote servers. `renderMcpServer` is the single transform; a
 * target that cannot carry one of the server's tokens gets `{ skip }` rather than a fragment
 * with an unexpanded token.
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, ConfigRoot } from '../types';
import { SigilError } from '../errors';
import { basenameOfId } from '../paths';
import { envTokenNames, expandEnvTokens } from './env-reference';
import type { EnvSyntax } from './env-reference';

/** The field names a catalog `mcp` artifact can author inside `server:` (src/schema/index.ts). */
export type McpField = 'command' | 'args' | 'env' | 'url' | 'headers';

/**
 * The data one target's MCP file needs to render a catalog server. A new target with a JSON MCP
 * file supplies one constant, not a builder; the portable format (`PORTABLE_MCP_DIALECT` in
 * ./portable-mcp.ts) is one value, Cursor's `.cursor/mcp.json` is another.
 */
export interface McpDialect {
  /** The JSON key that holds the server map (e.g. `mcpServers`). */
  readonly serversKey: string;
  /** How a `{sigil:env:NAME}` token is written in this file (EnvSyntax, ./env-reference.ts). */
  readonly envSyntax: EnvSyntax;
  /** The server fields in which an env token may appear; a token elsewhere skips the server. */
  readonly interpolatedFields: readonly McpField[];
  /** Write `type: 'stdio'` first on a stdio server; omit to leave the authored object untouched. */
  readonly stdioType?: 'stdio';
  /** On a remote server: `'drop'` removes `type`, `'keep'` leaves it in place. */
  readonly remoteType: 'keep' | 'drop';
}

/** The two outcomes of rendering one server: a named config, or a reason it cannot be written. */
export type McpServerRender = { name: string; config: Record<string, unknown> } | { skip: string };

/** Narrows a `renderMcpServer` result to the skip case. */
export function isMcpSkip(rendered: McpServerRender): rendered is { skip: string } {
  return 'skip' in rendered;
}

/** A copy of `value` without `key`, other keys in authored order. */
function omitKey(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (k !== key) out[k] = v;
  }
  return out;
}

/** The skip reason when a token appears in a field the dialect does not interpolate, else undefined. */
function skipReason(authored: Record<string, unknown>, dialect: McpDialect): string | undefined {
  const interpolated = new Set<string>(dialect.interpolatedFields);
  for (const [field, value] of Object.entries(authored)) {
    if (interpolated.has(field)) continue;
    const tokens = envTokenNames(value);
    if (tokens.length > 0) {
      const names = tokens.map(token => `{sigil:env:${token}}`).join(', ');
      return `${names} in ${field} is not expanded by this target`;
    }
  }
  return undefined;
}

/** Applies the dialect's `type` policy, preserving authored key order. */
function applyTypePolicy(
  authored: Record<string, unknown>,
  isStdio: boolean,
  isRemote: boolean,
  dialect: McpDialect,
): Record<string, unknown> {
  if (isStdio && dialect.stdioType === 'stdio') {
    // `type: 'stdio'` first, any authored `type` removed so there is exactly one type key.
    return { type: 'stdio', ...omitKey(authored, 'type') };
  }
  if (isRemote && dialect.remoteType === 'drop') {
    return omitKey(authored, 'type');
  }
  return authored;
}

/**
 * Renders one catalog `mcp` artifact's server under `dialect`. The name is `fm.name` or the id's
 * basename; `description` (catalog-only documentation) never reaches the config. A stdio server
 * (one with `command`) and a remote server (one with `url`) take the dialect's `type` policy, in
 * authored key order; then every `{sigil:env:NAME}` token is expanded through the dialect's
 * syntax. A token in a field outside `interpolatedFields` returns `{ skip }` naming the token and
 * the field before anything is expanded; a malformed token name still throws (an authoring error,
 * not a target gap).
 */
export function renderMcpServer(
  artifact: Pick<Artifact, 'id' | 'frontmatter'>,
  dialect: McpDialect,
): McpServerRender {
  const fm = artifact.frontmatter;
  const name = (fm.name as string | undefined) ?? basenameOfId(artifact.id);
  // `description` is catalog-only documentation, never a server field; strip it defensively.
  const { description: _d, ...authored } = (fm.server ?? {}) as Record<string, unknown>;
  void _d;

  const reason = skipReason(authored, dialect);
  if (reason !== undefined) return { skip: reason };

  const config = applyTypePolicy(authored, 'command' in authored, 'url' in authored, dialect);
  return { name, config: expandEnvTokens(config, dialect.envSyntax) };
}

/**
 * The object-spread op that merges `artifact`'s server into `dest` under `dialect.serversKey`.
 * Throws the skip reason (as a `SigilError`) when `renderMcpServer` skipped — callers check
 * `skipReason` first, as for hooks.
 */
export function mcpServerOp(
  artifact: Pick<Artifact, 'id' | 'frontmatter'>,
  dialect: McpDialect,
  dest: { file: string; root: ConfigRoot },
): ConfigMergeOp {
  const rendered = renderMcpServer(artifact, dialect);
  if (isMcpSkip(rendered)) {
    throw new SigilError(rendered.skip);
  }
  const { name, config } = rendered;
  const key = dialect.serversKey;
  return {
    file: dest.file,
    root: dest.root,
    fragment: { [key]: { [name]: config } },
    strategy: { [key]: 'object-spread' },
    section: key,
  };
}
