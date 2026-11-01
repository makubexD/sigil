/**
 * ConfigMergeOp builder for Cursor `hook` artifacts — the entry shape Cursor reads from
 * `.cursor/hooks.json` (project) and `~/.cursor/hooks.json` (user) (./config.ts; CURSOR_HOOKS_DOC and
 * CURSOR_THIRD_PARTY_HOOKS_DOC).
 *
 * Cursor imports Claude Code hooks through a fixed alias table (CURSOR_THIRD_PARTY_HOOKS_DOC). An
 * event or matcher the table has no entry for is skipped with its reason rather than rendered to
 * match nothing.
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, ConfigScope } from '../../types';
import { SigilError } from '../../errors';
import { nodeEvalCommandLine, posixCommandLine } from '../shared/hook-command-line';
import { resolveCursorConfigDestination } from './config';

/** Claude Code event → Cursor's camelCase event (CURSOR_THIRD_PARTY_HOOKS_DOC). */
const CURSOR_HOOK_EVENTS: ReadonlyMap<string, string> = new Map([
  ['PreToolUse', 'preToolUse'],
  ['PostToolUse', 'postToolUse'],
  ['UserPromptSubmit', 'beforeSubmitPrompt'],
  ['Stop', 'stop'],
  ['SubagentStop', 'subagentStop'],
  ['SessionStart', 'sessionStart'],
  ['SessionEnd', 'sessionEnd'],
  ['PreCompact', 'preCompact'],
  // No matcher: Cursor matches a subagent against its own type, not the agent name (Decision 1).
  ['SubagentStart', 'subagentStart'],
]);

/** Claude Code tool name → Cursor's tool name; every edit fires Cursor's `Write` (ADR, step 1). */
const CURSOR_TOOL_NAMES: ReadonlyMap<string, string> = new Map([
  ['Bash', 'Shell'],
  ['Read', 'Read'],
  ['Grep', 'Grep'],
  ['Task', 'Task'],
  ['WebFetch', 'WebFetch'],
  ['WebSearch', 'WebSearch'],
  ['Write', 'Write'],
  ['Edit', 'Write'],
  ['MultiEdit', 'Write'],
  ['NotebookEdit', 'Write'],
]);

/** Events whose matcher Cursor applies; on every other event a matcher is refused. */
const MATCHER_EVENTS: ReadonlySet<string> = new Set(['PreToolUse', 'PostToolUse']);

/** The advice every refusal carries: leave the hook off Cursor. */
const PLATFORMS_HINT = "Add 'platforms:' without 'cursor' so this hook is not installed there.";

/** Why Cursor has no event for this hook, or undefined when it does. */
function eventSkipReason(event: string): string | undefined {
  if (CURSOR_HOOK_EVENTS.has(event)) return undefined;
  return (
    `Cursor has no '${event}' hook event to map to — its Claude Code aliases cover tool, prompt, ` +
    `stop, session and compact events only. ${PLATFORMS_HINT}`
  );
}

/** Why Cursor can't translate this matcher, or undefined when it can. */
function matcherSkipReason(event: string, matcher: string | undefined): string | undefined {
  if (matcher === undefined || matcher === '*') return undefined;
  if (!MATCHER_EVENTS.has(event)) {
    return (
      `Cursor applies a matcher only to preToolUse and postToolUse, and '${event}' takes none — ` +
      `the hook would match every call. ${PLATFORMS_HINT}`
    );
  }
  const unsupported = matcher.split('|').find(part => !CURSOR_TOOL_NAMES.has(part));
  if (unsupported === undefined) return undefined;
  return (
    `'${unsupported}' is not a tool name sigil can translate to Cursor's (it maps only exact ` +
    `Claude Code tool names, never a pattern), so '${matcher}' cannot be translated. ${PLATFORMS_HINT}`
  );
}

/** Why Cursor's PowerShell on Windows would break this command line, or undefined when it is safe. */
function powershellSkipReason(fm: Artifact['frontmatter']): string | undefined {
  const command = fm.command as string;
  const args = fm.args as readonly string[] | undefined;
  if (nodeEvalCommandLine(command, args) !== undefined) return undefined;
  const quoted = [command, ...(args ?? [])].find(word => word.includes("'"));
  if (quoted === undefined) return undefined;
  return (
    `Cursor runs hooks through PowerShell on Windows, which would break the single quote in ` +
    `'${quoted}'. ${PLATFORMS_HINT}`
  );
}

/** Cursor's matcher for a Claude Code matcher, deduped first-seen; undefined for absent or '*'. */
function translateMatcher(matcher: string | undefined): string | undefined {
  if (matcher === undefined || matcher === '*') return undefined;
  const names: string[] = [];
  for (const part of matcher.split('|')) {
    const name = CURSOR_TOOL_NAMES.get(part);
    if (name !== undefined && !names.includes(name)) names.push(name);
  }
  return names.join('|');
}

/** The one command line Cursor runs; empty stdout lets a call through, so there is no wrapper. */
function commandLine(fm: Artifact['frontmatter']): string {
  const command = fm.command as string;
  const args = fm.args as readonly string[] | undefined;
  return nodeEvalCommandLine(command, args) ?? posixCommandLine(command, args);
}

/** The entry Cursor reads: type, command, then matcher and timeout when the hook sets them. */
function buildHookEntry(fm: Artifact['frontmatter']): Record<string, unknown> {
  const entry: Record<string, unknown> = { type: 'command', command: commandLine(fm) };
  const matcher = translateMatcher(fm.matcher as string | undefined);
  if (matcher !== undefined) entry.matcher = matcher;
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
  const event = CURSOR_HOOK_EVENTS.get(fm.event as string) as string;
  return [
    {
      ...resolveCursorConfigDestination('hook', scope),
      fragment: { version: 1, hooks: { [event]: [buildHookEntry(fm)] } },
      strategy: { version: 'file-marker', hooks: 'array-append' },
    },
  ];
}
