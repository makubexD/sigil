/**
 * ConfigMergeOp builder for Codex `hook` artifacts — the grouped entry shape Codex reads from
 * `.codex/hooks.json` (project) and `$CODEX_HOME/hooks.json` (user) (./config.ts; CODEX_HOOKS_DOC).
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, ConfigScope } from '../../types';
import { SigilError } from '../../errors';
import {
  nodeEvalCommandLine,
  posixCommandLine,
  windowsCommandLine,
} from '../shared/hook-command-line';
import { resolveCodexConfigDestination } from './config';

export {
  nodeEvalCommandLine,
  posixCommandLine,
  windowsCommandLine,
} from '../shared/hook-command-line';

/** The hook events Codex documents (CODEX_HOOKS_DOC). */
const CODEX_HOOK_EVENTS: ReadonlySet<string> = new Set([
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PreCompact',
  'PostCompact',
  'UserPromptSubmit',
  'SubagentStart',
  'SubagentStop',
  'Stop',
  'Interrupt',
  'SessionStart',
  'SessionEnd',
]);

/** Builds the single hook entry ({type: 'command', command, commandWindows?, timeout?}). */
function buildHookEntry(fm: Artifact['frontmatter']): Record<string, unknown> {
  const command = fm.command as string;
  const args = fm.args as readonly string[] | undefined;
  const nodeEval = nodeEvalCommandLine(command, args);
  const entry: Record<string, unknown> = {
    type: 'command',
    command: nodeEval ?? posixCommandLine(command, args),
  };
  const commandWindows = nodeEval === undefined ? windowsCommandLine(command, args) : undefined;
  if (commandWindows !== undefined) entry.commandWindows = commandWindows;
  if (fm.timeout !== undefined) entry.timeout = fm.timeout;
  return entry;
}

/** Refuses an event outside Codex's documented set. */
function refuseUndocumentedEvent(event: string): void {
  if (CODEX_HOOK_EVENTS.has(event)) return;
  throw new SigilError(
    `Codex documents no '${event}' hook event — its documented events are ` +
      `${[...CODEX_HOOK_EVENTS].join(', ')}.`,
  );
}

/** One array-append op per hook install, in the scope's Codex hook file (./config.ts). */
export function buildCodexHookOps(artifact: Artifact, scope: ConfigScope): ConfigMergeOp[] {
  const fm = artifact.frontmatter;
  const event = fm.event as string;
  refuseUndocumentedEvent(event);
  const fragment = {
    hooks: {
      [event]: [
        { matcher: (fm.matcher as string | undefined) ?? '*', hooks: [buildHookEntry(fm)] },
      ],
    },
  };
  return [
    {
      ...resolveCodexConfigDestination('hook', scope),
      fragment,
      strategy: { hooks: 'array-append' },
    },
  ];
}
