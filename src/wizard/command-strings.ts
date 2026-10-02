/**
 * Command-string builders and print helpers for the wizard.
 *
 * These are pure functions (or thin console wrappers) with no I/O side effects.
 */
import pc from 'picocolors';
import { copyableLine } from './frame';
import { withLauncher } from '../invocation';
import { log } from './prompts';
import { terminalWidth, visibleLength } from './terminal';
import type { Target } from '../types';
import { kindNoun } from '../select';

export interface EquivalentCommandOptions {
  selectors: string[];
  target: string;
  language?: string | undefined;
  kinds?: string[] | undefined;
  exclude?: string[] | undefined;
  includeDeps: boolean;
  overwrite: boolean;
  configScope?: string | undefined;
  /** True when the install includes at least one mcp/hook/settings artifact. When set,
   *  --scope is always emitted (even for the 'project' default) to pin the destination. */
  hasConfigKinds?: boolean | undefined;
}

/** Builds the `--scope <value>` flag, pinning it whenever config kinds are involved. */
function buildScopeFlag(opts: EquivalentCommandOptions): string | undefined {
  if (opts.hasConfigKinds) {
    // Config installs always pin the scope so the command documents the exact destination.
    return `--scope ${opts.configScope ?? 'project'}`;
  }
  if (opts.configScope && opts.configScope !== 'project') {
    // No config kinds: only surface a non-default scope (e.g. passed via --scope flag alone).
    return `--scope ${opts.configScope}`;
  }
  return undefined;
}

/**
 * Builds a copy-pasteable `sigil add …` command string from the effective
 * install options. Includes `--yes` so it runs non-interactively.
 * Used in both the wizard plan-box and the end-of-install summary in cli.ts.
 *
 * Invariant: the command must be the *complete, faithful equivalent* of the wizard
 * session — every consequential choice reflected, nothing silently dropped. For
 * config-kind installs (mcp/hook/settings) `--scope` is always emitted, even when
 * it equals the default (`project`), so the destination file + JSON section are pinned
 * in the pasteable command. Genuine non-config defaults (overwrite, deps, language)
 * may still be omitted.
 */
export function buildEquivalentCommand(opts: EquivalentCommandOptions): string {
  const parts = ['sigil add', ...opts.selectors, `--target ${opts.target}`];
  if (opts.language) parts.push(`--language ${opts.language}`);
  if (opts.kinds && opts.kinds.length > 0) parts.push(`--kind ${opts.kinds.join(',')}`);
  if (opts.exclude && opts.exclude.length > 0) parts.push(`--exclude ${opts.exclude.join(',')}`);
  if (!opts.includeDeps) parts.push('--no-deps');
  if (opts.overwrite) parts.push('--overwrite');
  const scopeFlag = buildScopeFlag(opts);
  if (scopeFlag) parts.push(scopeFlag);
  parts.push('--yes');
  return parts.join(' ');
}

/** Print a formatted conflict advisory after a partial install. */
export function printConflictAdvice(conflicting: string[]): void {
  log.warn(
    `${conflicting.length} file(s) already exist and were NOT overwritten:\n` +
      conflicting.map(f => `  ${f}`).join('\n') +
      '\n' +
      `Re-run with --overwrite to replace them, or use --dry-run to preview first.`,
  );
}

/** Print a formatted skipped-kinds advisory using the target's native vocabulary. */
export function printSkippedAdvice(
  skipped: Array<{ id: string; kind: string; reason: string }>,
  target?: Target,
): void {
  if (skipped.length === 0) return;
  log.warn(
    `${skipped.length} artifact(s) skipped:\n` +
      skipped.map(s => `  ${s.id} (${kindNoun(target, s.kind)}): ${s.reason}`).join('\n'),
  );
}

/**
 * Prints a command for the user to repeat, in a terminal: a label, then the command as one unbroken,
 * flush-left line with no gutter. A wrapped multi-line command pastes differently in PowerShell
 * (backtick), bash (backslash) and cmd (caret), and the shell cannot be detected, so one line of
 * plain characters is the form that means the same everywhere; a narrow window soft-wraps it,
 * which is fine. When an npm script launched sigil, `sigil` is replaced by how to launch it.
 */
export function printRepeatCommand(label: string, cmd: string): void {
  const command = withLauncher(cmd);
  const width = terminalWidth();
  const tooWide = width !== undefined && visibleLength(command) > width;
  const name = label.replace(/:$/, '');
  log.message(pc.dim(`${name}${tooWide ? ' (one line, copy all of it)' : ''}:`));
  copyableLine(pc.cyan(command));
}

/**
 * Prints the equivalent CLI command once, at the very end of the install flow. In a terminal it is
 * `printRepeatCommand`; in CI/pipe it is plain text.
 */
export function printEquivalentCommand(cmd: string, fancy: boolean): void {
  if (fancy) printRepeatCommand('Repeat non-interactively:', cmd);
  else console.log('\nRepeat non-interactively:\n  ' + cmd);
}
