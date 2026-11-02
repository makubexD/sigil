/**
 * ConfigMergeOp builder for Cursor `hook` artifacts — the entry shape Cursor reads from
 * `.cursor/hooks.json` (project) and `~/.cursor/hooks.json` (user) (./config.ts; CURSOR_HOOKS_DOC and
 * CURSOR_THIRD_PARTY_HOOKS_DOC).
 *
 * The entry is rendered from the provider-neutral hook contract (docs/decisions/
 * neutral-hook-contract-2026-11.md): the event and matcher go through ./hook-dialect.ts, and a
 * `script` hook becomes one base64 `node -e` command line (decision 5). Cursor has no `args`
 * field, so every execution is written as one command string.
 *
 * An event or matcher Cursor cannot render is skipped with its reason rather than rendered to
 * match nothing; `buildCursorHookOps` surfaces that same reason as an error for a caller that
 * skipped the check.
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, ConfigScope } from '../../types';
import { SigilError } from '../../errors';
import { normalizeHookEvent, parseHookMatcher, TOOL_HOOK_EVENTS } from '../../hook-vocabulary';
import type { HookEvent } from '../../hook-vocabulary';
import type { NeutralTool } from '../../tool-vocabulary';
import { composeHookScript } from '../hook-input';
import { hookCommand, hookCommandFields, hookEventFor, renderHookMatcher } from '../hook-render';
import { nodeEvalCommandLine, posixCommandLine } from '../shared/hook-command-line';
import { CURSOR_HOOK_EVENTS, CURSOR_HOOK_INPUT, CURSOR_HOOK_TOOL_DIALECT } from './hook-dialect';
import { resolveCursorConfigDestination } from './config';

/** The advice every refusal carries: leave the hook off Cursor. */
const PLATFORMS_HINT = "Add 'platforms:' without 'cursor' so this hook is not installed there.";

/** Cursor's event key and the neutral event behind it, or undefined when it has no name. */
function providerEvent(authored: string): { event: string; neutral: HookEvent } | undefined {
  const normalized = normalizeHookEvent(authored);
  const event = hookEventFor(CURSOR_HOOK_EVENTS, authored);
  if (normalized === undefined || event === undefined) return undefined;
  return { event, neutral: normalized.event };
}

/** Why Cursor has no event for this hook, or undefined when it does. */
function eventSkipReason(authored: string): string | undefined {
  if (providerEvent(authored) !== undefined) return undefined;
  return (
    `Cursor has no '${authored}' hook event to map to — its Claude Code aliases cover tool, ` +
    `prompt, stop and session events only. ${PLATFORMS_HINT}`
  );
}

/** Why Cursor can't translate this matcher, or undefined when it can. */
function matcherSkipReason(event: string, matcher: string | undefined): string | undefined {
  if (matcher === undefined || matcher === '' || matcher === '*') return undefined;
  const neutral = normalizeHookEvent(event)?.event;
  if (neutral === undefined || !TOOL_HOOK_EVENTS.includes(neutral)) {
    return (
      `Cursor applies a matcher only to preToolUse and postToolUse, and '${event}' takes none — ` +
      `the hook would match every call. ${PLATFORMS_HINT}`
    );
  }
  const rendered = renderHookMatcher(CURSOR_HOOK_TOOL_DIALECT, matcher);
  if (rendered.kind !== 'missing') return undefined;
  const unsupported = rendered.tools[0]!;
  return (
    `'${unsupported}' is not a tool name sigil can translate to Cursor's (it maps only the ` +
    `neutral tool names Cursor's hooks document, never a pattern), so '${matcher}' cannot be ` +
    `translated. ${PLATFORMS_HINT}`
  );
}

/** Why Cursor's PowerShell on Windows would break this command line, or undefined when it is safe. */
function powershellSkipReason(fm: Artifact['frontmatter']): string | undefined {
  const execution = hookCommand(hookCommandFields(fm));
  // A script hook is always the base64 `node -e` line, which carries no quoting hazard.
  if (execution.kind === 'script') return undefined;
  if (nodeEvalCommandLine(execution.command, execution.args) !== undefined) return undefined;
  const quoted = [execution.command, ...(execution.args ?? [])].find(word => word.includes("'"));
  if (quoted === undefined) return undefined;
  return (
    `Cursor runs hooks through PowerShell on Windows, which would break the single quote in ` +
    `'${quoted}'. ${PLATFORMS_HINT}`
  );
}

/** The one-line `node -e <composed>` invocation for a `script` hook. */
function scriptCommandLine(
  script: string,
  event: HookEvent,
  tools: readonly NeutralTool[] | undefined,
): string {
  const commandLine = nodeEvalCommandLine('node', [
    '-e',
    composeHookScript(script, CURSOR_HOOK_INPUT, event, tools),
  ]);
  if (commandLine === undefined)
    throw new Error('nodeEvalCommandLine refused its own `node -e` command');
  return commandLine;
}

/** The one command line Cursor runs; empty stdout lets a call through, so there is no wrapper. */
function commandLine(
  fm: Artifact['frontmatter'],
  event: HookEvent,
  tools: readonly NeutralTool[] | undefined,
): string {
  const execution = hookCommand(hookCommandFields(fm));
  if (execution.kind === 'script') return scriptCommandLine(execution.script, event, tools);
  return (
    nodeEvalCommandLine(execution.command, execution.args) ??
    posixCommandLine(execution.command, execution.args)
  );
}

/** Cursor's matcher and the neutral tools a composed script re-checks, refused when unnameable. */
function matcherFor(
  event: string,
  matcher: string | undefined,
): { matcher: string | undefined; tools: NeutralTool[] | undefined } {
  const rendered = renderHookMatcher(CURSOR_HOOK_TOOL_DIALECT, matcher);
  if (rendered.kind === 'missing')
    throw new Error(`Cursor has no hook tool name for '${rendered.tools[0]}'`);
  if (rendered.kind === 'all') return { matcher: undefined, tools: undefined };
  const parsed = parseHookMatcher(matcher);
  return { matcher: rendered.matcher, tools: parsed.kind === 'tools' ? parsed.tools : undefined };
}

/** The entry Cursor reads: type, command, then matcher and timeout when the hook sets them. */
function buildHookEntry(
  fm: Artifact['frontmatter'],
  event: HookEvent,
  matcher: { matcher: string | undefined; tools: NeutralTool[] | undefined },
): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    type: 'command',
    command: commandLine(fm, event, matcher.tools),
  };
  if (matcher.matcher !== undefined) entry.matcher = matcher.matcher;
  if (fm.timeout !== undefined) entry.timeout = fm.timeout;
  return entry;
}

/** Every reason Cursor cannot render this hook, or undefined when it can. */
export function cursorHookSkipReason(artifact: Artifact): string | undefined {
  const fm = artifact.frontmatter;
  const event = fm.event as string;
  return (
    eventSkipReason(event) ??
    matcherSkipReason(event, fm.matcher as string | undefined) ??
    powershellSkipReason(fm)
  );
}

/** One array-append op per hook install, in the scope's Cursor hook file (./config.ts). */
export function buildCursorHookOps(artifact: Artifact, scope: ConfigScope): ConfigMergeOp[] {
  const reason = cursorHookSkipReason(artifact);
  if (reason !== undefined) throw new SigilError(reason);
  const fm = artifact.frontmatter;
  const { event, neutral } = providerEvent(fm.event as string)!;
  const matcher = matcherFor(fm.event as string, fm.matcher as string | undefined);
  return [
    {
      ...resolveCursorConfigDestination('hook', scope),
      fragment: { version: 1, hooks: { [event]: [buildHookEntry(fm, neutral, matcher)] } },
      strategy: { version: 'file-marker', hooks: 'array-append' },
    },
  ];
}
