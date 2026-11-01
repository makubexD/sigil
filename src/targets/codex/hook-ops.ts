/**
 * ConfigMergeOp builder for Codex `hook` artifacts — the grouped entry shape Codex reads from
 * `.codex/hooks.json` (project) and `$CODEX_HOME/hooks.json` (user) (./config.ts; CODEX_HOOKS_DOC).
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, ConfigScope } from '../../types';
import { SigilError } from '../../errors';
import { resolveCodexConfigDestination } from './config';

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

/** The one node invocation windowsCommandLine special-cases: `node -e <script>`. */
const NODE_EVAL_ARG_COUNT = 2;

/**
 * Joins `command` and `args` into one POSIX shell command line; without `args`, `command` as
 * written. Words of only word/path characters stay bare; anything else is single-quoted.
 */
export function posixCommandLine(command: string, args?: readonly string[]): string {
  if (args === undefined) return command;
  const bare = /^[\w@%+=:,./-]+$/;
  const quote = (word: string): string =>
    bare.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;
  return [command, ...args].map(quote).join(' ');
}

/**
 * The `commandWindows` value for `command` + `args`; undefined without `args` (so Codex falls back
 * to `command`). `node -e <script>` becomes a base64 round-trip so the script text never passes
 * through cmd.exe quoting. Otherwise every word must be cmd.exe-safe or the hook is refused.
 */
export function windowsCommandLine(command: string, args?: readonly string[]): string | undefined {
  if (args === undefined) return undefined;
  if (command === 'node' && args.length === NODE_EVAL_ARG_COUNT && args[0] === '-e') {
    const script = args[1]!;
    return `node -e "eval(Buffer.from('${Buffer.from(script, 'utf8').toString('base64')}','base64').toString())"`;
  }
  const safe = /^[\w@+=:,./\\-]+$/;
  const unsafe = [command, ...args].find(word => !safe.test(word));
  if (unsafe !== undefined) {
    throw new SigilError(
      `this hook cannot be expressed as a cmd.exe command line: '${unsafe}' has characters ` +
        `cmd.exe would reinterpret, and a hook that cannot start lets every call through`,
      { hint: 'Restrict this hook to platforms where it can run, or use a node -e script.' },
    );
  }
  return [command, ...args].join(' ');
}

/** Builds the single hook entry ({type: 'command', command, commandWindows?, timeout?}). */
function buildHookEntry(fm: Artifact['frontmatter']): Record<string, unknown> {
  const command = fm.command as string;
  const args = fm.args as readonly string[] | undefined;
  const entry: Record<string, unknown> = {
    type: 'command',
    command: posixCommandLine(command, args),
  };
  const commandWindows = windowsCommandLine(command, args);
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
