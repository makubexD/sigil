/**
 * How the menu names AI tools (Claude Code, GitHub Copilot, …) in prose. Names and the list of
 * tools come from the target registry, so adding a provider changes no wording by hand.
 *
 * @module
 */
import { getAllTargets } from './targets';

/** The display name of a target, or its name when it has none. */
export function toolName(name: string): string {
  return getAllTargets().find(t => t.name === name)?.displayName ?? name;
}

/** Every tool `sigil init` can set up. */
export function setUpToolNames(): string[] {
  return getAllTargets()
    .filter(t => (t.initDirs?.length ?? 0) > 0)
    .map(t => t.name);
}

const DEFAULT_MAX_SHOWN = 3;

/**
 * Names in a sentence: "A", "A and B", "A, B and C", and past `max` "A, B, C and 2 more". `joiner`
 * is "and" or "or". Display names, so the list can grow with the registry without growing the line.
 */
export function toolList(
  names: readonly string[],
  joiner: 'and' | 'or' = 'and',
  max = DEFAULT_MAX_SHOWN,
): string {
  const shown = names.slice(0, max).map(toolName);
  const extra = names.length - shown.length;
  if (extra > 0) return `${shown.join(', ')} ${joiner} ${extra} more`;
  const last = shown.pop();
  return shown.length > 0 ? `${shown.join(', ')} ${joiner} ${last}` : (last ?? '');
}
