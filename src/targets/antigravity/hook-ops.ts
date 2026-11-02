/**
 * ConfigMergeOp builder for Antigravity `hook` artifacts — the hook-name-keyed entry Antigravity
 * reads from `.agents/hooks.json` (project) and `~/.gemini/config/hooks.json` (user)
 * (./config.ts; ANTIGRAVITY_HOOKS_DOC).
 *
 * The entry is rendered from the provider-neutral hook contract (docs/decisions/
 * neutral-hook-contract-2026-11.md): the event and matcher go through ./hook-dialect.ts, and a
 * `script` hook becomes one base64 `node -e` command line, exactly as the Cursor writer does.
 * Antigravity differs in two places (docs/plan-antigravity-target-e.md, decision 4):
 *
 * - The fragment is keyed by hook name, `{ "<hook name>": { "<Event>": [<entry>] } }`, with the
 *   default object-spread strategy on that key, so a user's other hooks are never touched.
 * - `PreToolUse` / `PostToolUse` wrap the handler in `{ matcher?, hooks: [...] }`; every other
 *   event takes the handler directly and ignores a matcher.
 *
 * An event or matcher Antigravity cannot render is skipped with its reason rather than rendered
 * to match nothing; `buildAntigravityHookOps` surfaces that same reason as an error for a caller
 * that skipped the check.
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, ConfigScope } from '../../types';
import { SigilError } from '../../errors';
import { normalizeHookEvent, parseHookMatcher, TOOL_HOOK_EVENTS } from '../../hook-vocabulary';
import type { HookEvent } from '../../hook-vocabulary';
import type { NeutralTool } from '../../tool-vocabulary';
import { destinationFor } from '../config-kind-table';
import { composeHookScript } from '../hook-input';
import { hookCommand, hookCommandFields, hookEventFor, renderHookMatcher } from '../hook-render';
import { nodeEvalCommandLine, posixCommandLine } from '../shared/hook-command-line';
import { ANTIGRAVITY_CONFIG_KINDS } from './config';
import {
  ANTIGRAVITY_HOOK_EVENTS,
  ANTIGRAVITY_HOOK_INPUT,
  ANTIGRAVITY_HOOK_TOOL_DIALECT,
} from './hook-dialect';

/** The advice every refusal carries: leave the hook off Antigravity. */
const PLATFORMS_HINT =
  "Add 'platforms:' without 'antigravity' so this hook is not installed there.";

/** Antigravity's event key and the neutral event behind it, or undefined when it has no name. */
function providerEvent(authored: string): { event: string; neutral: HookEvent } | undefined {
  const normalized = normalizeHookEvent(authored);
  const event = hookEventFor(ANTIGRAVITY_HOOK_EVENTS, authored);
  if (normalized === undefined || event === undefined) return undefined;
  return { event, neutral: normalized.event };
}

/** Why Antigravity has no event for this hook, or undefined when it does. */
function eventSkipReason(authored: string): string | undefined {
  if (providerEvent(authored) !== undefined) return undefined;
  return (
    `Antigravity has no '${authored}' hook event to map to — it has tool, session-start and ` +
    `stop events only. ${PLATFORMS_HINT}`
  );
}

/** Why Antigravity can't translate this matcher, or undefined when it can. */
function matcherSkipReason(event: string, matcher: string | undefined): string | undefined {
  if (matcher === undefined || matcher === '' || matcher === '*') return undefined;
  const neutral = normalizeHookEvent(event)?.event;
  if (neutral === undefined || !TOOL_HOOK_EVENTS.includes(neutral)) {
    return (
      `Antigravity applies a matcher only to PreToolUse and PostToolUse, and '${event}' takes ` +
      `none — the hook would match every call. ${PLATFORMS_HINT}`
    );
  }
  const rendered = renderHookMatcher(ANTIGRAVITY_HOOK_TOOL_DIALECT, matcher);
  if (rendered.kind !== 'missing') return undefined;
  const unsupported = rendered.tools[0]!;
  return (
    `'${unsupported}' is not a tool name sigil can translate to Antigravity's (it maps only ` +
    `the neutral tool names Antigravity's hooks document, never a pattern), so '${matcher}' ` +
    `cannot be translated. ${PLATFORMS_HINT}`
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
    composeHookScript(script, ANTIGRAVITY_HOOK_INPUT, event, tools),
  ]);
  if (commandLine === undefined)
    throw new Error('nodeEvalCommandLine refused its own `node -e` command');
  return commandLine;
}

/** The one command line Antigravity runs; empty stdout lets a call through, so no wrapper. */
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

/** Antigravity's matcher and the neutral tools a composed script re-checks, refused when unnameable. */
function matcherFor(
  event: string,
  matcher: string | undefined,
): { matcher: string | undefined; tools: NeutralTool[] | undefined } {
  const rendered = renderHookMatcher(ANTIGRAVITY_HOOK_TOOL_DIALECT, matcher);
  if (rendered.kind === 'missing')
    throw new Error(`Antigravity has no hook tool name for '${rendered.tools[0]}'`);
  if (rendered.kind === 'all') return { matcher: undefined, tools: undefined };
  const parsed = parseHookMatcher(matcher);
  return { matcher: rendered.matcher, tools: parsed.kind === 'tools' ? parsed.tools : undefined };
}

/** The handler both entry shapes carry: type, command, then timeout when the hook sets one. */
function buildHandler(
  fm: Artifact['frontmatter'],
  event: HookEvent,
  tools: readonly NeutralTool[] | undefined,
): Record<string, unknown> {
  const handler: Record<string, unknown> = {
    type: 'command',
    command: commandLine(fm, event, tools),
  };
  if (fm.timeout !== undefined) handler.timeout = fm.timeout;
  return handler;
}

/**
 * The entry Antigravity reads: a tool event wraps its handler in `{ matcher?, hooks: [...] }`
 * (no `matcher` key for every tool); any other event takes the handler directly.
 */
function buildHookEntry(
  fm: Artifact['frontmatter'],
  event: HookEvent,
  matcher: { matcher: string | undefined; tools: NeutralTool[] | undefined },
): Record<string, unknown> {
  const handler = buildHandler(fm, event, matcher.tools);
  if (!TOOL_HOOK_EVENTS.includes(event)) return handler;
  const entry: Record<string, unknown> = {};
  if (matcher.matcher !== undefined) entry.matcher = matcher.matcher;
  entry.hooks = [handler];
  return entry;
}

/** Every reason Antigravity cannot render this hook, or undefined when it can. */
export function antigravityHookSkipReason(artifact: Artifact): string | undefined {
  const fm = artifact.frontmatter;
  const event = fm.event as string;
  return eventSkipReason(event) ?? matcherSkipReason(event, fm.matcher as string | undefined);
}

/** One object-spread op per hook install, keyed by hook name (./config.ts). */
export function buildAntigravityHookOps(artifact: Artifact, scope: ConfigScope): ConfigMergeOp[] {
  const reason = antigravityHookSkipReason(artifact);
  if (reason !== undefined) throw new SigilError(reason);
  const fm = artifact.frontmatter;
  const { event, neutral } = providerEvent(fm.event as string)!;
  const matcher = matcherFor(fm.event as string, fm.matcher as string | undefined);
  const hookName = artifact.id.replaceAll('/', '-');
  const { file, root } = destinationFor(ANTIGRAVITY_CONFIG_KINDS, 'hook', scope, 'Antigravity');
  return [
    {
      file,
      root,
      fragment: { [hookName]: { [event]: [buildHookEntry(fm, neutral, matcher)] } },
      strategy: {},
    },
  ];
}
