/**
 * ConfigMergeOp builder for Copilot `hook` artifacts — the flat entry shape Copilot CLI and VS
 * Code read from `.github/hooks/sigil.json`, `.github/copilot/settings.local.json`, and
 * `$COPILOT_HOME/hooks/sigil.json` (./config.ts; COPILOT_HOOKS_DOC and VSCODE_HOOKS_DOC).
 *
 * The entry is rendered from the provider-neutral hook contract (docs/decisions/
 * neutral-hook-contract-2026-11.md): the event and matcher go through ./hook-dialect.ts, and a
 * `script` hook becomes the exec form `node -e <composed>`.
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, ConfigScope, MergeStrategy } from '../../types';
import { SigilError } from '../../errors';
import { normalizeHookEvent } from '../../hook-vocabulary';
import type { HookEvent } from '../../hook-vocabulary';
import type { NeutralTool } from '../../tool-vocabulary';
import { composeHookScript } from '../hook-input';
import type { HookInputDialect } from '../hook-input';
import { hookCommand, hookCommandFields, hookEventFor, hookMatcherFor } from '../hook-render';
import type { ToolDialect } from '../tool-dialect';
import { COPILOT_HOOK_EVENTS, COPILOT_HOOK_INPUT, COPILOT_HOOK_TOOL_DIALECT } from './hook-dialect';
import { resolveCopilotConfigDestination } from './config';

/** The fix for a hook Copilot cannot render. */
const COPILOT_HINT = `Restrict this hook to Claude Code with 'platforms: [claude]'.`;

/**
 * Events Copilot has no documented PascalCase alias for, with the camelCase name it does use.
 * Its payload and matcher semantics differ, so rendering one for Copilot is refused until a
 * probe shows it works (docs/decisions/neutral-hook-contract-2026-11.md decision 1).
 */
const UNALIASED_EVENTS: ReadonlyMap<HookEvent, string> = new Map<HookEvent, string>([
  ['notification', 'notification'],
]);

/** The tables one Copilot hook entry is rendered through; a test may supply a gap. */
export interface CopilotHookTables {
  readonly tools: ToolDialect;
  readonly events: ReadonlyMap<HookEvent, string>;
  readonly input: HookInputDialect;
}

/** Copilot's own tables. */
const COPILOT_HOOK_TABLES: CopilotHookTables = {
  tools: COPILOT_HOOK_TOOL_DIALECT,
  events: COPILOT_HOOK_EVENTS,
  input: COPILOT_HOOK_INPUT,
};

/** What a rendered hook contributes to its flat entry besides its execution fields. */
interface RenderedHook {
  readonly matcher: string;
  readonly event: HookEvent;
  readonly tools: NeutralTool[] | undefined;
  readonly input: HookInputDialect;
}

/** The entry's execution fields: the composed script, or the command with or without `args`. */
function executionFields(
  execution: ReturnType<typeof hookCommand>,
  rendered: RenderedHook,
): Record<string, unknown> {
  if (execution.kind === 'script')
    return {
      exec: 'node',
      args: [
        '-e',
        composeHookScript(execution.script, rendered.input, rendered.event, rendered.tools),
      ],
    };
  if (execution.args === undefined) return { command: execution.command };
  return { exec: execution.command, args: execution.args };
}

/**
 * The flat hook entry: type, matcher, execution fields, then timeoutSec. A `script` hook is the
 * exec form `node -e <composed>`; a `command` hook keeps a shell-form command when it has no
 * `args`, and the exec form when it does (Copilot CLI only; the cloud agent honors `command`).
 */
function buildHookEntry(
  fm: Artifact['frontmatter'],
  rendered: RenderedHook,
): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    type: 'command',
    matcher: rendered.matcher,
    ...executionFields(hookCommand(hookCommandFields(fm)), rendered),
  };
  if (fm.timeout !== undefined) entry.timeoutSec = fm.timeout;
  return entry;
}

/** Copilot's event name for a catalog event, refusing one it has no PascalCase alias for. */
function providerEvent(
  authored: string,
  events: ReadonlyMap<HookEvent, string>,
): { event: string; neutral: HookEvent } {
  const normalized = normalizeHookEvent(authored);
  const event = hookEventFor(events, authored);
  if (normalized !== undefined && event !== undefined) return { event, neutral: normalized.event };
  const neutral = normalized?.event;
  const camelAlias = neutral === undefined ? undefined : UNALIASED_EVENTS.get(neutral);
  if (neutral !== undefined && camelAlias !== undefined)
    throw new SigilError(
      `Copilot documents no PascalCase alias for the '${neutral}' hook event — its own ` +
        `'${camelAlias}' event has a different (camelCase) payload and matcher semantics.`,
      { hint: COPILOT_HINT },
    );
  throw new SigilError(`Copilot has no hook event for '${authored}'.`);
}

/** The event key and flat entry for one hook, through Copilot's tables unless a test supplies others. */
export function hookFragment(
  fm: Artifact['frontmatter'],
  tables: CopilotHookTables = COPILOT_HOOK_TABLES,
): { event: string; entry: Record<string, unknown> } {
  const { event, neutral } = providerEvent(fm.event as string, tables.events);
  const { matcher, tools } = hookMatcherFor(
    tables.tools,
    fm.matcher as string | undefined,
    'Copilot',
    COPILOT_HINT,
  );
  const rendered: RenderedHook = { matcher, event: neutral, tools, input: tables.input };
  return { event, entry: buildHookEntry(fm, rendered) };
}

/**
 * The fragment and per-key strategy. `version: 1` comes first for the standalone hook files
 * (project and user scope); `settings.local.json` carries hooks inline and takes no version.
 */
function buildFragment(
  event: string,
  entry: Record<string, unknown>,
  scope: ConfigScope,
): { fragment: Record<string, unknown>; strategy: Record<string, MergeStrategy> } {
  const fragment: Record<string, unknown> = {};
  const strategy: Record<string, MergeStrategy> = { hooks: 'array-append' };
  if (scope !== 'local') {
    fragment.version = 1;
    // Shared by every hook in the file: uninstall keeps it while another hook remains.
    strategy.version = 'file-marker';
  }
  fragment.hooks = { [event]: [entry] };
  return { fragment, strategy };
}

/** One array-append op per hook install, in the scope's Copilot hook file (./config.ts). */
export function buildCopilotHookOps(artifact: Artifact, scope: ConfigScope): ConfigMergeOp[] {
  const { event, entry } = hookFragment(artifact.frontmatter);
  const { fragment, strategy } = buildFragment(event, entry, scope);
  return [{ ...resolveCopilotConfigDestination('hook', scope), fragment, strategy }];
}
