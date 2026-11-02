/**
 * The provider-neutral hook vocabulary. A catalog hook names an event (`before-tool`,
 * `prompt-submit`, …) and a matcher (`*`, or neutral tool names joined with `|`), and each
 * target's hook layer maps those to what its provider really reads. This module is
 * platform-neutral: it names no target and knows no provider syntax.
 *
 * The alias table is the set of event names the catalog used before the neutral vocabulary,
 * adopted as the shared legacy set in docs/decisions/neutral-hook-contract-2026-11.md. Legacy
 * matching is case-sensitive here. Matchers reuse the tool vocabulary's aliases
 * (`src/tool-vocabulary.ts`).
 *
 * @module
 */

import { normalizeTools, type NeutralTool } from './tool-vocabulary';

/** Every event a catalog hook can name, in one shared vocabulary. */
export const HOOK_EVENTS = [
  'before-tool',
  'after-tool',
  'prompt-submit',
  'session-start',
  'stop',
  'subagent-stop',
  'notification',
] as const;

/** A hook event a catalog artifact can name, in the shared vocabulary. */
export type HookEvent = (typeof HOOK_EVENTS)[number];

/** The events that fire around a tool call, and so accept a tool matcher. */
export const TOOL_HOOK_EVENTS: readonly HookEvent[] = ['before-tool', 'after-tool'];

/** The provider event names the catalog used before the neutral vocabulary, mapped to it. */
export const LEGACY_HOOK_EVENT_ALIASES: Readonly<Record<string, HookEvent>> = Object.freeze({
  PreToolUse: 'before-tool',
  PostToolUse: 'after-tool',
  UserPromptSubmit: 'prompt-submit',
  SessionStart: 'session-start',
  Stop: 'stop',
  SubagentStop: 'subagent-stop',
  Notification: 'notification',
});

/** The neutral event a legacy name stands for, or `undefined` for anything else. */
function legacyAliasOf(name: string): HookEvent | undefined {
  // Own keys only: `constructor`, `toString` and friends are unknown names, not aliases.
  return Object.hasOwn(LEGACY_HOOK_EVENT_ALIASES, name)
    ? LEGACY_HOOK_EVENT_ALIASES[name]
    : undefined;
}

/**
 * Resolve one event name: its neutral event, and whether the input was a legacy alias.
 * Returns `undefined` for an unknown name.
 */
export function normalizeHookEvent(
  name: string,
): { event: HookEvent; legacy: boolean } | undefined {
  if ((HOOK_EVENTS as readonly string[]).includes(name))
    return { event: name as HookEvent, legacy: false };
  const event = legacyAliasOf(name);
  return event === undefined ? undefined : { event, legacy: true };
}

/**
 * Parse a hook matcher. `undefined`, `''` and `'*'` mean every tool; anything else is split on
 * `|`, trimmed, and resolved through `normalizeTools`, so legacy tool names are flagged and
 * unrecognized names are reported rather than silently dropped. An empty part (`edit|`) is
 * unknown too: dropping it could leave no tools, which a provider reads as "every tool".
 */
export function parseHookMatcher(
  matcher: string | undefined,
): { kind: 'all' } | { kind: 'tools'; tools: NeutralTool[]; legacy: string[]; unknown: string[] } {
  if (matcher === undefined || matcher === '' || matcher === '*') return { kind: 'all' };
  const names = matcher.split('|').map(part => part.trim());
  return { kind: 'tools', ...normalizeTools(names) };
}
