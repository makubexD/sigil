/**
 * Rendering the neutral hook vocabulary for one target: its matcher, its event name, and its
 * command. A target supplies a hook tool table (a `names` `ToolDialect`) and an event table;
 * these helpers do the mapping, so no target re-implements it. A `read-only-flag` dialect has no
 * tool list to write a matcher from and is refused.
 *
 * @module
 */
import { SigilError } from '../errors';
import { normalizeHookEvent, parseHookMatcher } from '../hook-vocabulary';
import type { HookEvent } from '../hook-vocabulary';
import type { HookFrontmatter } from '../schema';
import type { Artifact } from '../types';
import type { NeutralTool } from '../tool-vocabulary';
import { renderTools } from './tool-dialect';
import type { ToolDialect } from './tool-dialect';

/** What to write for a neutral matcher: every tool, the provider's names, or the unnameable tools. */
export type RenderedHookMatcher =
  | { kind: 'all' }
  | { kind: 'names'; matcher: string }
  | { kind: 'missing'; tools: NeutralTool[] };

/**
 * Render a catalog hook's matcher through a target's hook tool `dialect`. `undefined`, `''` and
 * `'*'` mean every tool; otherwise the neutral (and legacy) names resolve through
 * `parseHookMatcher` and are written in the dialect's order, joined with `|`. A neutral tool the
 * dialect cannot name is reported as `missing` rather than dropped: a guard matching fewer calls
 * than authored looks active and lets the rest through. A `read-only-flag` dialect cannot express
 * a matcher and throws.
 */
export function renderHookMatcher(
  dialect: ToolDialect,
  matcher: string | undefined,
): RenderedHookMatcher {
  if (dialect.kind === 'read-only-flag')
    throw new Error('a hook matcher needs a `names` tool dialect, not `read-only-flag`');
  const parsed = parseHookMatcher(matcher);
  if (parsed.kind === 'all') return { kind: 'all' };
  const rendered = renderTools(dialect, parsed.tools);
  if (rendered.kind !== 'names')
    throw new Error('a hook matcher needs a `names` tool dialect, not `read-only-flag`');
  if (rendered.missing.length > 0) return { kind: 'missing', tools: rendered.missing };
  return { kind: 'names', matcher: rendered.names.join('|') };
}

/**
 * The provider event name for a catalog event, or `undefined` when the target maps no such event.
 * Both a neutral name and a legacy alias resolve through `normalizeHookEvent`.
 */
export function hookEventFor(
  table: ReadonlyMap<HookEvent, string>,
  event: string,
): string | undefined {
  const normalized = normalizeHookEvent(event);
  return normalized === undefined ? undefined : table.get(normalized.event);
}

/** The hook fields `hookCommand` reads from the parsed hook frontmatter. */
export type HookCommandFields = Pick<HookFrontmatter, 'script' | 'command' | 'args'>;

/**
 * The hook's execution fields, read once: a `script` (rendered as a composed `node -e`), or a
 * `command` with optional `args`. The schema already requires exactly one of `script` and
 * `command`; the throw here guards a caller that skipped it.
 */
export function hookCommand(
  fm: HookCommandFields,
): { kind: 'script'; script: string } | { kind: 'command'; command: string; args?: string[] } {
  if (fm.script !== undefined) return { kind: 'script', script: fm.script };
  if (fm.command === undefined)
    throw new Error('a hook sets exactly one of `script` and `command`');
  return fm.args === undefined
    ? { kind: 'command', command: fm.command }
    : { kind: 'command', command: fm.command, args: fm.args };
}

/** The hook's execution fields from raw artifact frontmatter, with only the keys it sets. */
export function hookCommandFields(fm: Artifact['frontmatter']): HookCommandFields {
  return {
    ...(typeof fm.script === 'string' ? { script: fm.script } : {}),
    ...(typeof fm.command === 'string' ? { command: fm.command } : {}),
    ...(Array.isArray(fm.args) ? { args: fm.args as string[] } : {}),
  };
}

/**
 * A target's matcher (`'*'` for every tool) and the neutral tools it names (`undefined` for
 * every tool), refusing a tool the target's table cannot name. `provider` names the target in
 * the error; `hint` is passed through.
 */
export function hookMatcherFor(
  dialect: ToolDialect,
  authored: string | undefined,
  provider: string,
  hint?: string,
): { matcher: string; tools: NeutralTool[] | undefined } {
  const rendered = renderHookMatcher(dialect, authored);
  if (rendered.kind === 'missing')
    throw new SigilError(
      `${provider} has no hook tool name for ${rendered.tools.map(tool => `'${tool}'`).join(', ')}.`,
      hint === undefined ? {} : { hint },
    );
  const parsed = parseHookMatcher(authored);
  return {
    matcher: rendered.kind === 'all' ? '*' : rendered.matcher,
    tools: parsed.kind === 'tools' ? parsed.tools : undefined,
  };
}
