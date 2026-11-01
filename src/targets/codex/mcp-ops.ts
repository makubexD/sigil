/**
 * ConfigMergeOp builder for Codex `mcp` artifacts — the `[mcp_servers.<name>]` tables Codex reads
 * from `.codex/config.toml` (project) and `$CODEX_HOME/config.toml` (user) (./config.ts;
 * CODEX_MCP_DOC).
 *
 * Codex does not expand `${NAME}` in server config (probe A7). An `env` value that is exactly
 * `{sigil:env:KEY}` for its own key becomes `env_vars = ["KEY"]`, which Codex forwards by name;
 * any other `{sigil:env:…}` token is refused — there is no expansion that would ever reach it.
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, ConfigScope } from '../../types';
import { SigilError } from '../../errors';
import { basenameOfId } from '../../paths';
import { envTokenNames } from '../env-reference';
import { resolveCodexConfigDestination } from './config';

/** The fields Codex documents on a stdio server (CODEX_MCP_DOC). */
const STDIO_FIELDS: ReadonlySet<string> = new Set(['command', 'args', 'env', 'cwd']);
/** The fields Codex documents on a remote (streamable-HTTP) server. */
const REMOTE_FIELDS: ReadonlySet<string> = new Set(['type', 'url', 'headers']);

/** The one remote-server type Codex documents: streamable HTTP via `url`. */
const DOCUMENTED_REMOTE_TYPE = 'http';

/** Matches a value that is exactly one `{sigil:env:NAME}` token, capturing the name. */
const WHOLE_ENV_TOKEN = /^\{sigil:env:([^}]+)\}$/;

/** Throws naming the first `{sigil:env:…}` token in `value`, which Codex cannot expand. */
function refuseEnvTokens(value: unknown, where: string): void {
  const names = envTokenNames(value);
  if (names.length === 0) return;
  throw new SigilError(
    `Codex does not expand {sigil:env:${names[0]}} in MCP config (found in ${where}) — ` +
      'env variables are forwarded by name through env_vars, never expanded in place',
  );
}

/** Refuses any `server` field Codex does not document for this transport. */
function refuseUnknownFields(
  server: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  transport: string,
): void {
  for (const key of Object.keys(server)) {
    if (!allowed.has(key)) {
      throw new SigilError(`Codex documents no '${key}' field on an MCP ${transport} server`);
    }
  }
}

/**
 * Splits an authored `env` record: a value that is exactly `{sigil:env:KEY}` for its own key
 * forwards by name (`env_vars`); a value with no token stays in `env`; anything else throws.
 */
function splitEnv(env: Record<string, unknown>): {
  env: Record<string, unknown>;
  envVars: string[];
} {
  const kept: Record<string, unknown> = {};
  const envVars: string[] = [];
  for (const [key, raw] of Object.entries(env)) {
    if (typeof raw === 'string') {
      const match = WHOLE_ENV_TOKEN.exec(raw);
      if (match !== null && match[1] === key) {
        envVars.push(match[1]!);
        continue;
      }
    }
    refuseEnvTokens(raw, 'env');
    kept[key] = raw;
  }
  return { env: kept, envVars };
}

/** The Codex config for a stdio server: `command`, plus `args`/`env`/`cwd` as authored. */
function buildStdioConfig(server: Record<string, unknown>): Record<string, unknown> {
  refuseUnknownFields(server, STDIO_FIELDS, 'stdio');
  refuseEnvTokens(server.command, 'command');
  const config: Record<string, unknown> = { command: server.command };
  if (server.args !== undefined) {
    refuseEnvTokens(server.args, 'args');
    config.args = server.args;
  }
  if (server.cwd !== undefined) {
    refuseEnvTokens(server.cwd, 'cwd');
    config.cwd = server.cwd;
  }
  if (server.env !== undefined) {
    const { env, envVars } = splitEnv(server.env as Record<string, unknown>);
    if (Object.keys(env).length > 0) config.env = env;
    if (envVars.length > 0) config.env_vars = envVars;
  }
  return config;
}

/** The Codex config for a remote server: `url`, plus static `headers` as `http_headers`. */
function buildRemoteConfig(server: Record<string, unknown>): Record<string, unknown> {
  refuseUnknownFields(server, REMOTE_FIELDS, 'remote');
  refuseEnvTokens(server.url, 'url');
  if (server.type !== undefined && server.type !== DOCUMENTED_REMOTE_TYPE) {
    throw new SigilError(
      `Codex documents no '${String(server.type)}' MCP server type — its remote servers are ` +
        'streamable HTTP (drop the type and set a url)',
    );
  }
  const config: Record<string, unknown> = { url: server.url };
  if (server.headers !== undefined) {
    const headers = server.headers as Record<string, unknown>;
    refuseEnvTokens(headers, 'headers');
    config.http_headers = headers;
  }
  return config;
}

/** Renders the authored `server` frontmatter into Codex's `mcp_servers` config. */
function buildServerConfig(server: Record<string, unknown>): Record<string, unknown> {
  if (typeof server.command === 'string') return buildStdioConfig(server);
  if (typeof server.url === 'string') return buildRemoteConfig(server);
  throw new SigilError('a Codex MCP server needs a command (stdio) or a url (streamable HTTP)');
}

/** One object-spread op on `mcp_servers` in the scope's Codex config.toml (./config.ts). */
export function buildCodexMcpOps(artifact: Artifact, scope: ConfigScope): ConfigMergeOp[] {
  const fm = artifact.frontmatter;
  const name = (fm.name as string | undefined) ?? basenameOfId(artifact.id);
  const config = buildServerConfig(fm.server as Record<string, unknown>);
  return [
    {
      ...resolveCodexConfigDestination('mcp', scope),
      fragment: { mcp_servers: { [name]: config } },
      strategy: { mcp_servers: 'object-spread' },
      section: 'mcp_servers',
    },
  ];
}
