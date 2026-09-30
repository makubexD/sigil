/**
 * Per-kind ConfigMergeOp builders for the Claude Code `scaffoldConfig` path
 * (hook / settings / mcp) — split out of `index.ts`'s `scaffoldConfig` switch so
 * each kind's fragment-building logic is independently readable and testable.
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, MergeStrategy } from '../../types';
import { basenameOfId } from '../../paths';
import { CLAUDE_MCP_SERVERS_KEY } from './config';
import type { ConfigDestination } from './config';

/** Builds the single hook entry ({type, command, args?, timeout?}) from an artifact's frontmatter. */
function buildHookEntry(fm: Artifact['frontmatter']): Record<string, unknown> {
  const command = fm.command as string;
  const args = fm.args as string[] | undefined;
  const timeout = fm.timeout as number | undefined;
  const hookEntry: Record<string, unknown> = { type: 'command', command };
  if (args !== undefined) hookEntry.args = args;
  if (timeout !== undefined) hookEntry.timeout = timeout;
  return hookEntry;
}

export function buildHookConfigOps(artifact: Artifact, dest: ConfigDestination): ConfigMergeOp[] {
  const fm = artifact.frontmatter;
  const event = fm.event as string;
  const matcher = (fm.matcher as string | undefined) ?? '*';

  // Claude Code hooks format:
  // { hooks: { [event]: [{ matcher: "...", hooks: [{type: "command", command: "..."}] }] } }
  const fragment: Record<string, unknown> = {
    hooks: { [event]: [{ matcher, hooks: [buildHookEntry(fm)] }] },
  };
  return [
    {
      file: dest.file,
      root: dest.root,
      fragment,
      // hooks key uses array-append so multiple hooks can coexist for the same event
      strategy: { hooks: 'array-append' },
    },
  ];
}

/** One settings field's presence-check and merge strategy. */
interface SettingsFieldSpec {
  key: string;
  value: unknown;
  strategy: MergeStrategy;
  present: boolean;
}

function permissionsSpec(fm: Artifact['frontmatter']): SettingsFieldSpec {
  const permissions = fm.permissions as
    | { allow?: string[]; deny?: string[]; ask?: string[] }
    | undefined;
  return {
    key: 'permissions',
    value: permissions,
    strategy: 'array-union',
    present: Boolean(permissions),
  };
}

function envSpec(fm: Artifact['frontmatter']): SettingsFieldSpec {
  const env = fm.env as Record<string, string> | undefined;
  return {
    key: 'env',
    value: env,
    strategy: 'object-spread',
    present: Boolean(env && Object.keys(env).length > 0),
  };
}

/** Enumerates the settings fields present in frontmatter, alongside their merge strategy. */
function settingsFieldSpecs(fm: Artifact['frontmatter']): SettingsFieldSpec[] {
  const model = fm.model as string | undefined;
  return [
    permissionsSpec(fm),
    envSpec(fm),
    { key: 'model', value: model, strategy: 'object-spread', present: Boolean(model) },
    {
      key: 'statusLine',
      value: fm.statusLine,
      strategy: 'object-spread',
      present: fm.statusLine !== undefined,
    },
  ];
}

export function buildSettingsConfigOps(
  artifact: Artifact,
  dest: ConfigDestination,
): ConfigMergeOp[] {
  const fragment: Record<string, unknown> = {};
  const strategy: Record<string, MergeStrategy> = {};
  for (const spec of settingsFieldSpecs(artifact.frontmatter)) {
    if (!spec.present) continue;
    fragment[spec.key] = spec.value;
    strategy[spec.key] = spec.strategy;
  }

  if (Object.keys(fragment).length === 0) return [];
  return [{ file: dest.file, root: dest.root, fragment, strategy }];
}

/** Builds the mcp-local wrapped ConfigMergeOp: nests the fragment under `dest.wrapPath`. */
function buildWrappedMcpOp(
  dest: ConfigDestination,
  serverName: string,
  serverConfig: Record<string, unknown>,
): ConfigMergeOp {
  // mcp-local scope: wrap fragment under projects.<absProjectDir>.mcpServers
  // so deep-merge leaves other project entries intact.
  const [topKey, ...nested] = dest.wrapPath!;
  // wrapPath is always non-empty when set (validated at construction time)
  if (!topKey) throw new Error('[claude] mcp wrapPath must have at least one key');
  let inner: Record<string, unknown> = { [CLAUDE_MCP_SERVERS_KEY]: { [serverName]: serverConfig } };
  for (const k of [...nested].reverse()) {
    inner = { [k]: inner };
  }
  return {
    file: dest.file,
    root: dest.root,
    fragment: { [topKey]: inner },
    strategy: { [topKey]: 'object-spread' },
    // Same derivation as configScopes() in index.ts, so the scope-menu hint and the
    // actual merge op always agree on the section string by construction.
    section: [...dest.wrapPath!, CLAUDE_MCP_SERVERS_KEY].join(' › '),
  };
}

export function buildMcpConfigOps(artifact: Artifact, dest: ConfigDestination): ConfigMergeOp[] {
  const fm = artifact.frontmatter;
  const server = fm.server as Record<string, unknown>;
  const serverName = (fm.name as string | undefined) ?? basenameOfId(artifact.id);
  // Strip any catalog-only fields before storing
  const { description: _d, ...serverConfig } = server as Record<string, unknown>;
  void _d;

  if (dest.wrapPath) {
    return [buildWrappedMcpOp(dest, serverName, serverConfig)];
  }

  return [
    {
      file: dest.file,
      root: dest.root,
      fragment: { [CLAUDE_MCP_SERVERS_KEY]: { [serverName]: serverConfig } },
      strategy: { [CLAUDE_MCP_SERVERS_KEY]: 'object-spread' },
      section: CLAUDE_MCP_SERVERS_KEY,
    },
  ];
}
