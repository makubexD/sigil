/**
 * Command-line builders shared by the Codex and Cursor hook writers: one line a shell can run for a
 * hook's `command` + `args`, plus the `node -e <script>` special case.
 *
 * @module
 */
import { SigilError } from '../../errors';

/** The one node invocation windowsCommandLine special-cases: `node -e <script>`. */
const NODE_EVAL_ARG_COUNT = 2;

/**
 * `node -e <script>` as one line with no `$`, backtick, backslash, `!` or newline, so the same text
 * runs in sh, fish, zsh, nushell, tcsh and cmd.exe. Codex runs a hook through the user's shell, and
 * a hook that can't start lets every call through. Undefined for any other command.
 */
export function nodeEvalCommandLine(command: string, args?: readonly string[]): string | undefined {
  if (command !== 'node' || args?.length !== NODE_EVAL_ARG_COUNT || args[0] !== '-e') {
    return undefined;
  }
  const encoded = Buffer.from(args[1]!, 'utf8').toString('base64');
  return `node -e "eval(Buffer.from('${encoded}','base64').toString())"`;
}

/**
 * Joins `command` and `args` into one POSIX shell command line; without `args`, `command` as
 * written. Words of only word/path characters stay bare; anything else is single-quoted.
 */
export function posixCommandLine(command: string, args?: readonly string[]): string {
  if (args === undefined) return command;
  const bare = /^[\w@+:,./-]+$/;
  const quote = (word: string): string =>
    bare.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;
  return [command, ...args].map(quote).join(' ');
}

/**
 * The `commandWindows` value for `command` + `args`; undefined without `args` (so Codex falls back
 * to `command`). Every word must be cmd.exe-safe or the hook is refused.
 */
export function windowsCommandLine(command: string, args?: readonly string[]): string | undefined {
  if (args === undefined) return undefined;
  const safe = /^[\w@+=:,./\\-]+$/;
  const unsafe = [command, ...args].find(word => !safe.test(word));
  if (unsafe !== undefined) {
    throw new SigilError(
      `this hook cannot be expressed as a cmd.exe command line: '${unsafe}' has characters ` +
        `cmd.exe would reinterpret, and a hook that cannot start lets every call through`,
      { hint: 'Restrict this hook to platforms where it can run, or use a node -e script.' },
    );
  }
  return [command, ...args].join(' ');
}
