/**
 * How sigil was started, so a command printed for the user to paste actually runs. After
 * `npm run sigil` the `sigil` binary is usually not on PATH, so `sigil uninstall …` would fail with
 * "not recognized"; npm tells the child process which script launched it.
 *
 * Also which shell the user is in, best effort, only to pick the line continuation of a command too
 * long for the window (backtick, caret or backslash). No variable names the shell outright, so a
 * wrong guess is possible and `SIGIL_SHELL` overrides it.
 *
 * @module
 */

/** The shells whose line continuation differs: PowerShell, cmd, and bash-like (Git Bash, macOS, Linux). */
export type Shell = 'powershell' | 'cmd' | 'posix';

/** How each shell is named to the user, and the character that continues a line in it. */
export const SHELLS: Record<Shell, { name: string; continuation: string }> = {
  powershell: { name: 'PowerShell', continuation: '`' },
  cmd: { name: 'cmd', continuation: '^' },
  posix: { name: 'bash', continuation: '\\' },
};

const OVERRIDES: Record<string, Shell> = {
  powershell: 'powershell',
  pwsh: 'powershell',
  cmd: 'cmd',
  bash: 'posix',
  sh: 'posix',
  zsh: 'posix',
};

/** PowerShell puts its per-user module folder in PSModulePath at startup; a fresh cmd never has it. */
const POWERSHELL_USER_MODULES = /\\Documents\\(Windows)?PowerShell\\Modules/i;

/**
 * The shell the user most likely types in. In order: `SIGIL_SHELL`; anything but Windows is bash-like;
 * `MSYSTEM` / `SHELL` mean Git Bash; the per-user PowerShell module folder means PowerShell; else cmd.
 * A cmd started inside PowerShell inherits PowerShell's variables and is reported as PowerShell.
 */
export function detectShell(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Shell {
  const override = OVERRIDES[(env['SIGIL_SHELL'] ?? '').toLowerCase()];
  if (override) return override;
  if (platform !== 'win32') return 'posix';
  if (env['MSYSTEM'] || env['SHELL']) return 'posix';
  return POWERSHELL_USER_MODULES.test(env['PSModulePath'] ?? '') ? 'powershell' : 'cmd';
}

/** Characters one of PowerShell, cmd and bash still expands inside double quotes. */
const UNSAFE_IN_QUOTES = /["$`%!^&|<>;()]/;

/**
 * `node <cli.js>` for the script node is running, written so every shell reads it the same way
 * (forward slashes, double quotes around a space), or `undefined` when no such form is safe.
 */
function nodeCommandFor(script: string | undefined): string | undefined {
  if (!script) return undefined;
  const path = script.replace(/\\/g, '/');
  if (UNSAFE_IN_QUOTES.test(path)) return undefined;
  return `node ${path.includes(' ') ? `"${path}"` : path}`;
}

/**
 * What to type to run sigil: `sigil`; or, when an npm script launched it, `node <absolute cli.js>`,
 * which runs from any folder (`npm run` only works where that package.json is). It falls back to
 * `npm run <script> --` when the path has a character the shells treat differently.
 */
export function launcherPrefix(
  env: NodeJS.ProcessEnv = process.env,
  script: string | undefined = process.argv[1],
): string {
  const event = env['npm_lifecycle_event'];
  const launchedByScript =
    env['npm_command'] === 'run-script' && /\bcli\.js\b/.test(env['npm_lifecycle_script'] ?? '');
  if (!launchedByScript || !event) return 'sigil';
  return nodeCommandFor(script) ?? `npm run ${event} --`;
}

/** `command` with its leading `sigil` replaced by how sigil is launched here. */
export function withLauncher(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  script: string | undefined = process.argv[1],
): string {
  return command.replace(/^sigil(?= |$)/, () => launcherPrefix(env, script));
}
