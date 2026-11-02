/**
 * `sigil add` — warns when a hook's command is not on the PATH the install runs under.
 *
 * A `script:` hook has no command of its own: every hook target installs it as `node -e`, so
 * the command to check for one is `node`.
 *
 * A hook that cannot start fails open: the agent lets the call through. sigil cannot check the
 * machine the hook will eventually run on, so this is a warning, never an error.
 *
 * @module
 */
import fs from 'fs';
import path from 'path';
import type { WrittenConfig } from './execute-config';

/** The extensions Windows appends to a bare command name when `PATHEXT` is unset. */
const WINDOWS_DEFAULT_PATHEXT = '.EXE;.CMD;.BAT;.COM';

/** `PATHEXT` entries are separated by `;` on every Windows shell (not `path.delimiter` on posix). */
const PATHEXT_SEPARATOR = ';';

/** True when `file` exists and is executable by this process. */
function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** The file names Windows may find for a bare `command`: the name itself plus each `PATHEXT`. */
function windowsCandidates(command: string, env: NodeJS.ProcessEnv): string[] {
  const extensions = (env.PATHEXT ?? WINDOWS_DEFAULT_PATHEXT).split(PATHEXT_SEPARATOR);
  return [command, ...extensions.map(ext => `${command}${ext}`)];
}

/**
 * Whether a bare `command` name resolves to an executable in `env.PATH`.
 *
 * Empty PATH entries are skipped (they are not a search directory). On win32 the lookup also
 * tries `PATHEXT`, so `node` finds `node.exe`.
 */
export function commandOnPath(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const dirs = (env.PATH ?? '').split(path.delimiter).filter(dir => dir !== '');
  const names = platform === 'win32' ? windowsCandidates(command, env) : [command];
  return dirs.some(dir => names.some(name => isExecutable(path.join(dir, name))));
}

/** A bare command name (no path separators) is the only kind sigil can resolve on PATH. */
function isBareCommand(command: unknown): command is string {
  return typeof command === 'string' && !command.includes('/') && !command.includes('\\');
}

/** The command a hook runs through: its own `command`, or `node` for a `script:` hook. */
function hookCommand(frontmatter: Record<string, unknown>): unknown {
  if (typeof frontmatter.command === 'string') return frontmatter.command;
  if (typeof frontmatter.script === 'string') return 'node';
  return undefined;
}

/**
 * Warns for each written hook whose bare `command` (or the `node` a `script:` hook runs through)
 * is not on this machine's PATH.
 *
 * A project install may run on another machine, so this never sets `process.exitCode`.
 */
export function warnHookCommandsOffPath(written: WrittenConfig[]): void {
  for (const { id, artifact } of written) {
    if (artifact.kind !== 'hook') continue;
    const command = hookCommand(artifact.frontmatter);
    if (!isBareCommand(command) || commandOnPath(command)) continue;
    console.warn(
      `  ⚠  hook ${id}: '${command}' is not on PATH here, and a hook that can't start lets every call through`,
    );
  }
}
