/**
 * Runs Claude Code's own validator over the built Claude output: the marketplace manifest in
 * dist/claude and every plugin under dist/claude/plugins, in strict mode (warnings fail). It checks
 * what sigil emits against Claude Code's real rules, beyond sigil's own conformance checks.
 *
 * Needs `claude` on PATH and a prior `npm run catalog:build`. It needs no login and no API key.
 * When `claude` is missing it fails in CI (CI=true) and skips with a notice elsewhere, so
 * `npm run ci:local` still works on a machine without Claude Code.
 *
 * Run: node scripts/validate-claude-plugins.cjs
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DIST = path.resolve(__dirname, '..', 'dist', 'claude');
const PLUGINS = path.join(DIST, 'plugins');
const SHELL = process.platform === 'win32';
const ENV = {
  ...process.env,
  DISABLE_AUTOUPDATER: '1',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
};

function claudeAvailable() {
  return spawnSync('claude', ['--version'], { shell: SHELL, env: ENV }).status === 0;
}

function validate(target) {
  // Windows runs `claude` (a .cmd shim) through cmd.exe, which joins the arguments unquoted, so a
  // path with spaces needs quotes. Pack names are kebab-case (packs-config.ts), so nothing else
  // in the path needs escaping.
  const arg = SHELL ? `"${target}"` : target;
  const result = spawnSync('claude', ['plugin', 'validate', '--strict', arg], {
    shell: SHELL,
    env: ENV,
    encoding: 'utf8',
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function main() {
  if (!claudeAvailable()) {
    const message = 'claude (Claude Code CLI) is not on PATH';
    if (process.env.CI) {
      console.error(`✗ ${message}; the CI job must install it.`);
      process.exit(1);
    }
    console.log(`- ${message}; skipping the Claude plugin validation.`);
    return;
  }
  if (!fs.existsSync(PLUGINS)) {
    console.error('✗ dist/claude/plugins not found; run npm run catalog:build first.');
    process.exit(1);
  }
  const targets = [DIST, ...fs.readdirSync(PLUGINS).map(name => path.join(PLUGINS, name))];
  const failed = targets.map(target => ({ target, ...validate(target) })).filter(r => !r.ok);
  for (const r of failed) console.error(`✗ ${path.relative(process.cwd(), r.target)}\n${r.output}`);
  if (failed.length > 0) process.exit(1);
  console.log(
    `✓ claude plugin validate --strict: marketplace and ${targets.length - 1} plugin(s) pass.`,
  );
}

main();
