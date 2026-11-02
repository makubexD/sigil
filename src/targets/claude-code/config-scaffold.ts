/**
 * Per-kind ConfigMergeOp builders for the Claude Code `scaffoldConfig` path
 * (hook / settings / mcp) — split out of `index.ts`'s `scaffoldConfig` switch so
 * each kind's fragment-building logic is independently readable and testable.
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, MergeStrategy } from '../../types';
import { SigilError } from '../../errors';
import { normalizeHookEvent, parseHookMatcher } from '../../hook-vocabulary';
import type { HookEvent } from '../../hook-vocabulary';
import type { NeutralTool } from '../../tool-vocabulary';
import { composeHookScript } from '../hook-input';
import { hookCommand, hookEventFor, renderHookMatcher } from '../hook-render';
import type { HookCommandFields } from '../hook-render';
import { CLAUDE_HOOK_EVENTS, CLAUDE_HOOK_INPUT, CLAUDE_HOOK_TOOL_DIALECT } from './hook-dialect';
import { CLAUDE_MCP_SERVERS_KEY } from './config';
import { portableMcpOp, portableMcpServer } from '../portable-mcp';
import type { ConfigDestination } from './config';

/** The hook's execution fields, built with only the keys the frontmatter sets. */
function commandFields(fm: Artifact['frontmatter']): HookCommandFields {
  return {
    ...(typeof fm.script === 'string' ? { script: fm.script } : {}),
    ...(typeof fm.command === 'string' ? { command: fm.command } : {}),
    ...(Array.isArray(fm.args) ? { args: fm.args as string[] } : {}),
  };
}

/**
 * Builds the single hook entry ({type, command, args?, timeout?}). A `script` hook is the exec
 * form `node -e <composed>`; a `command` hook keeps its command and args.
 */
function buildHookEntry(
  fm: Artifact['frontmatter'],
  event: HookEvent,
  tools?: readonly NeutralTool[],
): Record<string, unknown> {
  const execution = hookCommand(commandFields(fm));
  const hookEntry: Record<string, unknown> =
    execution.kind === 'script'
      ? {
          type: 'command',
          command: 'node',
          args: ['-e', composeHookScript(execution.script, CLAUDE_HOOK_INPUT, event, tools)],
        }
      : { type: 'command', command: execution.command };
  if (execution.kind === 'command' && execution.args !== undefined) hookEntry.args = execution.args;
  const timeout = fm.timeout as number | undefined;
  if (timeout !== undefined) hookEntry.timeout = timeout;
  return hookEntry;
}

/** Claude Code's event name for a catalog event, refusing one it does not document. */
function providerEvent(authored: string): { event: string; neutral: HookEvent } {
  const normalized = normalizeHookEvent(authored);
  const event = hookEventFor(CLAUDE_HOOK_EVENTS, authored);
  if (normalized === undefined || event === undefined)
    throw new SigilError(`Claude Code has no '${authored}' hook event.`);
  return { event, neutral: normalized.event };
}

/** Claude Code's matcher and the neutral tools it names, refusing a tool it cannot name. */
function providerMatcher(authored: string | undefined): {
  matcher: string;
  tools: NeutralTool[] | undefined;
} {
  const rendered = renderHookMatcher(CLAUDE_HOOK_TOOL_DIALECT, authored);
  if (rendered.kind === 'missing')
    throw new SigilError(
      `Claude Code has no hook tool name for ${rendered.tools.map(tool => `'${tool}'`).join(', ')}.`,
    );
  const parsed = parseHookMatcher(authored);
  return {
    matcher: rendered.kind === 'all' ? '*' : rendered.matcher,
    tools: parsed.kind === 'tools' ? parsed.tools : undefined,
  };
}

export function hookFragment(fm: Artifact['frontmatter']): Record<string, unknown> {
  const { event, neutral } = providerEvent(fm.event as string);
  const { matcher, tools } = providerMatcher(fm.matcher as string | undefined);

  // Claude Code hooks format:
  // { hooks: { [event]: [{ matcher: "...", hooks: [{type: "command", command: "..."}] }] } }
  return { hooks: { [event]: [{ matcher, hooks: [buildHookEntry(fm, neutral, tools)] }] } };
}

export function buildHookConfigOps(artifact: Artifact, dest: ConfigDestination): ConfigMergeOp[] {
  return [
    {
      file: dest.file,
      root: dest.root,
      fragment: hookFragment(artifact.frontmatter),
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
  if (dest.wrapPath) {
    const { name, config } = portableMcpServer(artifact);
    return [buildWrappedMcpOp(dest, name, config)];
  }
  // The same entry Copilot writes into the shared .mcp.json (../portable-mcp.ts).
  return [portableMcpOp(artifact, { file: dest.file, root: dest.root ?? 'project' })];
}
