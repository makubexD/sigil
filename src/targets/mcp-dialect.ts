/**
 * What one target's MCP file expects, given as data. A catalog `mcp` artifact authors a
 * provider-neutral server (`server:`) with `{sigil:env:NAME}` tokens; each target turns it into
 * the file it writes through one `McpDialect` value instead of a hand-rolled builder: which JSON
 * key servers sit under, how env tokens are expanded, which fields may carry a token, the `type`
 * policy for stdio and remote servers, and the field shape (`envKey`, `commandForm`).
 * `renderMcpServer` is the single transform; a target that cannot carry one of the server's
 * tokens gets `{ skip }` rather than a fragment with an unexpanded token.
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, ConfigRoot } from '../types';
import { SigilError } from '../errors';
import { basenameOfId } from '../paths';
import { envTokenNames, expandEnvTokens, isEnvName } from './env-reference';
import type { EnvSyntax } from './env-reference';

/** The field names a catalog `mcp` artifact can author inside `server:` (src/schema/index.ts). */
export type McpField = 'command' | 'args' | 'env' | 'url' | 'headers';

/** How a dialect writes an env reference: a syntax, or `'inherited'` (see `McpDialect`). */
export type McpEnvSyntax = EnvSyntax | 'inherited';

/**
 * The data one target's MCP file needs to render a catalog server. A new target with a JSON MCP
 * file supplies one constant, not a builder; the portable format (`PORTABLE_MCP_DIALECT` in
 * ./portable-mcp.ts) is one value, Cursor's `.cursor/mcp.json` is another.
 *
 * The type parameter defaults to a real `EnvSyntax`, so a dialect constant annotated plain
 * `McpDialect` keeps a callable `envSyntax.format`; a dialect that passes env references through
 * the client's environment instantiates it with `'inherited'` (or the full `McpEnvSyntax`).
 */
export interface McpDialect<S extends McpEnvSyntax = EnvSyntax> {
  /** The JSON key that holds the server map (e.g. `mcpServers`). */
  readonly serversKey: string;
  /**
   * How a `{sigil:env:NAME}` token is written in this file (EnvSyntax, ./env-reference.ts).
   * `'inherited'`: the file expands no references, and the server inherits the client's
   * environment. An identity `env` entry (`NAME: {sigil:env:NAME}`) is dropped, since the server
   * already sees `NAME`; any other token skips the server.
   */
  readonly envSyntax: S;
  /** The server fields in which an env token may appear; a token elsewhere skips the server. */
  readonly interpolatedFields: readonly McpField[];
  /** Write the server's `env` under this key, in `env`'s key position; omit to keep `env`. */
  readonly envKey?: string;
  /**
   * `'array'`: a server with `command` writes `command: [command, ...args]` in `command`'s key
   * position and drops `args` (a missing `args` means `[command]`); omit to keep the authored
   * shape. A server without `command` is left alone.
   */
  readonly commandForm?: 'array';
  /**
   * Write `type: <stdioType>` first on a stdio server (`'stdio'` or `'local'`, whichever the file
   * format expects), replacing any authored `type`; omit to leave the authored object untouched.
   */
  readonly stdioType?: 'stdio' | 'local';
  /**
   * On a remote server: `'drop'` removes `type`, `'keep'` leaves it in place, and `{ set }` writes
   * `type: <set>` first, replacing any authored `type`.
   */
  readonly remoteType: 'keep' | 'drop' | { readonly set: string };
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

/**
 * Removes every identity `env` entry (`K: '{sigil:env:K}'`) from `authored`, other keys in
 * authored order; `env` itself is omitted when that empties it. Any other `authored` is returned
 * unchanged. Only meaningful when the dialect's `envSyntax` is `'inherited'`: the server already
 * sees those variables through the inherited environment.
 */
function dropIdentityEnv(authored: Record<string, unknown>): Record<string, unknown> {
  const env = authored.env;
  if (env === null || typeof env !== 'object' || Array.isArray(env)) return authored;
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
    // A malformed name is never an identity entry: it stays, so the server is skipped with its reason.
    if (isEnvName(key) && value === `{sigil:env:${key}}`) continue;
    kept[key] = value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(authored)) {
    if (key === 'env') {
      if (Object.keys(kept).length > 0) out.env = kept;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** The skip reason when a token appears in a field the dialect does not interpolate, else undefined. */
function skipReason(
  authored: Record<string, unknown>,
  dialect: McpDialect<McpEnvSyntax>,
): string | undefined {
  const interpolated = new Set<string>(dialect.interpolatedFields);
  for (const [field, value] of Object.entries(authored)) {
    if (interpolated.has(field)) continue;
    const tokens = envTokenNames(value);
    if (tokens.length > 0) {
      const names = tokens.map(token => `{sigil:env:${token}}`).join(', ');
      return dialect.envSyntax === 'inherited'
        ? `${names} in ${field} is not carried by this target: it expands no environment references, and only an identity env entry (NAME: {sigil:env:NAME}) is passed through the inherited environment`
        : `${names} in ${field} is not expanded by this target`;
    }
  }
  return undefined;
}

/** Applies the dialect's `type` policy, preserving authored key order. */
function applyTypePolicy(
  authored: Record<string, unknown>,
  isStdio: boolean,
  isRemote: boolean,
  dialect: McpDialect<McpEnvSyntax>,
): Record<string, unknown> {
  if (isStdio && dialect.stdioType !== undefined) {
    // `type: <stdioType>` first, any authored `type` removed so there is exactly one type key.
    return { type: dialect.stdioType, ...omitKey(authored, 'type') };
  }
  if (isRemote && typeof dialect.remoteType === 'object') {
    return { type: dialect.remoteType.set, ...omitKey(authored, 'type') };
  }
  if (isRemote && dialect.remoteType === 'drop') {
    return omitKey(authored, 'type');
  }
  return authored;
}

/**
 * Applies the dialect's field shape while preserving key order: `env` is written under `envKey`,
 * and `commandForm: 'array'` folds `args` into `command` as `[command, ...args]` in `command`'s
 * position, dropping the `args` entry. A server without `command` is left alone.
 */
function shapeFields(
  config: Record<string, unknown>,
  dialect: McpDialect<McpEnvSyntax>,
): Record<string, unknown> {
  const foldCommand = dialect.commandForm === 'array' && 'command' in config;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key === 'args' && foldCommand) continue;
    if (key === 'env' && dialect.envKey !== undefined) {
      out[dialect.envKey] = value;
      continue;
    }
    if (key === 'command' && foldCommand) {
      out[key] = Array.isArray(config.args) ? [value, ...config.args] : [value];
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Renders one catalog `mcp` artifact's server under `dialect`. The name is `fm.name` or the id's
 * basename; `description` (catalog-only documentation) never reaches the config. A stdio server
 * (one with `command`) and a remote server (one with `url`) take the dialect's `type` policy, in
 * authored key order; then the dialect's field shape (`envKey` renames `env`, `commandForm:
 * 'array'` folds `args` into an array `command`) is applied in place; then every
 * `{sigil:env:NAME}` token is expanded through the dialect's syntax. A token in a field outside
 * `interpolatedFields` returns `{ skip }` naming the token and the authored field before anything
 * is expanded; a malformed token name still throws (an authoring error, not a target gap).
 */
export function renderMcpServer(
  artifact: Pick<Artifact, 'id' | 'frontmatter'>,
  dialect: McpDialect<McpEnvSyntax>,
): McpServerRender {
  const fm = artifact.frontmatter;
  const name = (fm.name as string | undefined) ?? basenameOfId(artifact.id);
  // `description` is catalog-only documentation, never a server field; strip it defensively.
  const { description: _d, ...authored } = (fm.server ?? {}) as Record<string, unknown>;
  void _d;

  const source = dialect.envSyntax === 'inherited' ? dropIdentityEnv(authored) : authored;

  const reason = skipReason(source, dialect);
  if (reason !== undefined) return { skip: reason };

  const typed = applyTypePolicy(source, 'command' in source, 'url' in source, dialect);
  const config = shapeFields(typed, dialect);
  if (dialect.envSyntax === 'inherited') return { name, config };
  return { name, config: expandEnvTokens(config, dialect.envSyntax) };
}

/**
 * The object-spread op that merges `artifact`'s server into `dest` under `dialect.serversKey`.
 * Throws the skip reason (as a `SigilError`) when `renderMcpServer` skipped — callers check
 * `skipReason` first, as for hooks.
 */
export function mcpServerOp(
  artifact: Pick<Artifact, 'id' | 'frontmatter'>,
  dialect: McpDialect<McpEnvSyntax>,
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
