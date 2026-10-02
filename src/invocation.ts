/**
 * How sigil was started, so a command printed for the user to paste actually runs. After
 * `npm run sigil` the `sigil` binary is usually not on PATH, so `sigil uninstall …` would fail with
 * "not recognized"; npm tells the child process which script launched it. The *shell* (PowerShell,
 * cmd, Git Bash) is deliberately not detected: no environment variable separates PowerShell from cmd,
 * and the printed command is one line of plain characters that means the same in all of them.
 *
 * @module
 */

/** What to type to run sigil: `sigil`, or `npm run <script> --` when an npm script launched it. */
export function launcherPrefix(env: NodeJS.ProcessEnv = process.env): string {
  const event = env['npm_lifecycle_event'];
  const launchedByScript =
    env['npm_command'] === 'run-script' && /\bcli\.js\b/.test(env['npm_lifecycle_script'] ?? '');
  return launchedByScript && event ? `npm run ${event} --` : 'sigil';
}

/** `command` with its leading `sigil` replaced by how sigil is launched here. */
export function withLauncher(command: string, env: NodeJS.ProcessEnv = process.env): string {
  return command.replace(/^sigil(?= |$)/, launcherPrefix(env));
}
