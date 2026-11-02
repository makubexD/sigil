/**
 * ConfigMergeOp builder for Codex `hook` artifacts — the grouped entry shape Codex reads from
 * `.codex/hooks.json` (project) and `$CODEX_HOME/hooks.json` (user) (./config.ts; CODEX_HOOKS_DOC).
 *
 * The entry is rendered from the provider-neutral hook contract (docs/decisions/
 * neutral-hook-contract-2026-11.md): the event and matcher go through ./hook-dialect.ts, and a
 * `script` hook becomes one base64 `node -e` command line (Codex refuses `args`, probe A3).
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, ConfigScope } from '../../types';
import { SigilError } from '../../errors';
import { normalizeHookEvent } from '../../hook-vocabulary';
import type { HookEvent } from '../../hook-vocabulary';
import type { NeutralTool } from '../../tool-vocabulary';
import { composeHookScript } from '../hook-input';
import { hookCommand, hookCommandFields, hookEventFor, hookMatcherFor } from '../hook-render';
import {
  nodeEvalCommandLine,
  posixCommandLine,
  windowsCommandLine,
} from '../shared/hook-command-line';
import { CODEX_HOOK_EVENTS, CODEX_HOOK_INPUT, CODEX_HOOK_TOOL_DIALECT } from './hook-dialect';
import { resolveCodexConfigDestination } from './config';

export {
  nodeEvalCommandLine,
  posixCommandLine,
  windowsCommandLine,
} from '../shared/hook-command-line';

/** The one-line `node -e <composed>` invocation for a `script` hook. */
function scriptCommandLine(
  script: string,
  event: HookEvent,
  tools: readonly NeutralTool[] | undefined,
): string {
  const commandLine = nodeEvalCommandLine('node', [
    '-e',
    composeHookScript(script, CODEX_HOOK_INPUT, event, tools),
  ]);
  if (commandLine === undefined)
    throw new Error('nodeEvalCommandLine refused its own `node -e` command');
  return commandLine;
}

/** The one line an execution runs, and its cmd.exe override for a non-node command. */
function commandLineFor(
  execution: ReturnType<typeof hookCommand>,
  event: HookEvent,
  tools?: readonly NeutralTool[],
): { command: string; commandWindows: string | undefined } {
  if (execution.kind === 'script')
    return {
      command: scriptCommandLine(execution.script, event, tools),
      commandWindows: undefined,
    };
  const nodeEval = nodeEvalCommandLine(execution.command, execution.args);
  return {
    command: nodeEval ?? posixCommandLine(execution.command, execution.args),
    commandWindows:
      nodeEval === undefined ? windowsCommandLine(execution.command, execution.args) : undefined,
  };
}

/** Builds the single hook entry ({type: 'command', command, commandWindows?, timeout?}). */
function buildHookEntry(
  fm: Artifact['frontmatter'],
  event: HookEvent,
  tools?: readonly NeutralTool[],
): Record<string, unknown> {
  const { command, commandWindows } = commandLineFor(
    hookCommand(hookCommandFields(fm)),
    event,
    tools,
  );
  const entry: Record<string, unknown> = { type: 'command', command };
  if (commandWindows !== undefined) entry.commandWindows = commandWindows;
  if (fm.timeout !== undefined) entry.timeout = fm.timeout;
  return entry;
}

/** Codex's event name for a catalog event, refusing one it has no documented name for. */
function providerEvent(authored: string): { event: string; neutral: HookEvent } {
  const normalized = normalizeHookEvent(authored);
  const event = hookEventFor(CODEX_HOOK_EVENTS, authored);
  if (normalized === undefined || event === undefined)
    throw new SigilError(
      `Codex has no hook event for '${authored}' — it maps the neutral events ` +
        `${[...CODEX_HOOK_EVENTS.keys()].join(', ')}.`,
    );
  return { event, neutral: normalized.event };
}

/** The event key and one grouped entry ({matcher, hooks: [entry]}) for a hook. */
export function hookFragment(fm: Artifact['frontmatter']): {
  event: string;
  group: Record<string, unknown>;
} {
  const { event, neutral } = providerEvent(fm.event as string);
  const { matcher, tools } = hookMatcherFor(
    CODEX_HOOK_TOOL_DIALECT,
    fm.matcher as string | undefined,
    'Codex',
  );
  return { event, group: { matcher, hooks: [buildHookEntry(fm, neutral, tools)] } };
}

/** One array-append op per hook install, in the scope's Codex hook file (./config.ts). */
export function buildCodexHookOps(artifact: Artifact, scope: ConfigScope): ConfigMergeOp[] {
  const { event, group } = hookFragment(artifact.frontmatter);
  const fragment = { hooks: { [event]: [group] } };
  return [
    {
      ...resolveCodexConfigDestination('hook', scope),
      fragment,
      strategy: { hooks: 'array-append' },
    },
  ];
}
