/**
 * ConfigMergeOp builder for Copilot `hook` artifacts — the flat entry shape Copilot CLI and VS
 * Code read from `.github/hooks/sigil.json`, `.github/copilot/settings.local.json`, and
 * `$COPILOT_HOME/hooks/sigil.json` (./config.ts; COPILOT_HOOKS_DOC and VSCODE_HOOKS_DOC).
 *
 * @module
 */
import type { Artifact, ConfigMergeOp, ConfigScope, MergeStrategy } from '../../types';
import { SigilError } from '../../errors';
import { resolveCopilotConfigDestination } from './config';

/**
 * Events Copilot has no documented PascalCase alias for. Copilot spells them camelCase with a
 * different payload, so rendering one for Copilot is refused until a probe shows it works
 * (docs/decisions/copilot-hooks-2026-10.md §2 and §4).
 */
const UNALIASED_EVENTS: ReadonlyMap<string, string> = new Map([
  ['Stop', 'agentStop'],
  ['SubagentStop', 'subagentStop'],
  ['Notification', 'notification'],
]);

/** The flat hook entry: type, matcher, exec/args or command, then timeoutSec. */
function buildHookEntry(fm: Artifact['frontmatter']): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    type: 'command',
    matcher: (fm.matcher as string | undefined) ?? '*',
  };
  if (fm.args !== undefined) {
    // Exec form: Copilot CLI only (the cloud agent honors `command`).
    entry.exec = fm.command;
    entry.args = fm.args;
  } else {
    // Shell form, the cross-platform field.
    entry.command = fm.command;
  }
  if (fm.timeout !== undefined) entry.timeoutSec = fm.timeout;
  return entry;
}

/** Refuses an event Copilot has no documented PascalCase alias for. */
function refuseUnaliasedEvent(event: string): void {
  const camelAlias = UNALIASED_EVENTS.get(event);
  if (camelAlias === undefined) return;
  throw new SigilError(
    `Copilot documents no PascalCase alias for the '${event}' hook event — its own ` +
      `'${camelAlias}' event has a different (camelCase) payload and matcher semantics.`,
    { hint: `Restrict this hook to Claude Code with 'platforms: [claude]'.` },
  );
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
  const fm = artifact.frontmatter;
  const event = fm.event as string;
  refuseUnaliasedEvent(event);
  const { fragment, strategy } = buildFragment(event, buildHookEntry(fm), scope);
  return [{ ...resolveCopilotConfigDestination('hook', scope), fragment, strategy }];
}
