/**
 * Command-string builders and print helpers for the wizard.
 *
 * These are pure functions (or thin console wrappers) with no I/O side effects.
 */
import pc from 'picocolors';
import { copyableLine } from './frame';
import { SHELLS, detectShell, withLauncher } from '../invocation';
import type { Shell } from '../invocation';
import { log } from './prompts';
import { terminalWidth } from './terminal';
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
  skipped: Array<{ id: string; kind: string; reason: string; cause?: string }>,
  target?: Target,
): void {
  const delivered = skipped.filter(s => s.cause === 'inlined');
  const rest = skipped.filter(s => s.cause !== 'inlined');
  if (delivered.length > 0) {
    log.info(
      `Already inside another pick, nothing to add:\n` +
        delivered.map(s => `  ${s.id} (${kindNoun(target, s.kind)}): ${s.reason}`).join('\n'),
    );
  }
  if (rest.length === 0) return;
  log.warn(
    `${rest.length} artifact(s) skipped:\n` +
      rest.map(s => `  ${s.id} (${kindNoun(target, s.kind)}): ${s.reason}`).join('\n'),
  );
}

/** A line stops one column short of the window, so the terminal never wraps on the last cell. */
const SPARE_COLUMN = 1;
/**
 * Columns before a command line: the width of the `│  ` gutter, as spaces. Not the bar itself, because a
 * selection would copy it and `│` is an error in every shell; leading spaces are harmless in all of them.
 */
const COMMAND_INDENT = 3;
/** A word is a run of non-space characters, or a double-quoted stretch (a path with spaces) kept whole. */
const WORD = /(?:"[^"]*"|\S)+/g;

/**
 * `cmd` as lines that fit `width`, for a command too long for one. It breaks only between words
 * (never inside an id) and ends each line but the last with the shell's continuation character, so
 * pasting every line runs the one command. A word longer than a line stands alone on its own.
 * Joining the lines without the continuations gives back `cmd`. Fits as is: one line, no continuation.
 */
export function wrapCommand(cmd: string, width: number | undefined, shell: Shell): string[] {
  if (width === undefined || cmd.length <= width - SPARE_COLUMN) return [cmd];
  const { continuation } = SHELLS[shell];
  const room = Math.max(width - SPARE_COLUMN - ' '.length - continuation.length, 1);
  const lines: string[] = [];
  let line = '';
  for (const word of cmd.match(WORD) ?? []) {
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= room) line += ` ${word}`;
    else {
      lines.push(`${line} ${continuation}`);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

/**
 * Prints a command for the user to repeat, in a terminal: a label, then the command in the text
 * column, every line at the same level, indented with spaces and no `│` bar so a selection holds the
 * command and nothing else. One line when it fits; otherwise wrapped between words with the
 * continuation of the shell the user is probably in, named in the label (`SIGIL_SHELL` corrects a
 * wrong guess). When an npm script launched sigil, `sigil` is
 * replaced by how to launch it.
 */
export function printRepeatCommand(label: string, cmd: string): void {
  const width = terminalWidth();
  const lines = wrapCommand(
    withLauncher(cmd),
    width === undefined ? undefined : width - COMMAND_INDENT,
    detectShell(),
  );
  const name = label.replace(/:$/, '');
  const shell = SHELLS[detectShell()].name;
  const note =
    lines.length > 1
      ? ` for ${shell} (copy all ${lines.length} lines; SIGIL_SHELL changes this)`
      : '';
  log.message(pc.dim(`${name}${note}:`));
  const indent = ' '.repeat(COMMAND_INDENT);
  copyableLine(pc.cyan(lines.map(line => indent + line).join('\n')));
}

/**
 * Prints the equivalent CLI command once, at the very end of the install flow. In a terminal it is
 * `printRepeatCommand`; in CI/pipe it is plain text.
 */
export function printEquivalentCommand(cmd: string, fancy: boolean): void {
  if (fancy) printRepeatCommand('Repeat non-interactively:', cmd);
  else console.log('\nRepeat non-interactively:\n  ' + cmd);
}
