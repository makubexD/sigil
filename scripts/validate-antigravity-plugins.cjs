/**
 * Runs Antigravity's own validator over the built Antigravity output: every plugin under
 * dist/antigravity/plugins. It checks what sigil emits against Antigravity's real plugin rules,
 * beyond sigil's own conformance checks. Errors and warnings fail, as with `--strict`, except the
 * warning that an MCP server's command is not on this machine's PATH, which says nothing about the
 * plugin.
 *
 * Needs `agy` on PATH and a prior `npm run catalog:build`. It needs no sign-in and no API key.
 * When `agy` is missing it skips with a notice and exits 0, in CI too, because the CI job has no
 * `agy` (decision 9 in docs/plan-antigravity-target-f.md).
 *
 * SIGIL_ANTIGRAVITY_DIST overrides the plugins root (default dist/antigravity/plugins under the
 * package root), so a deliberately broken copy can be validated without touching dist/.
 *
 * Run: node scripts/validate-antigravity-plugins.cjs
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PLUGINS = path.resolve(
  process.env.SIGIL_ANTIGRAVITY_DIST ||
    path.join(__dirname, '..', 'dist', 'antigravity', 'plugins'),
);
const SHELL = process.platform === 'win32';

function agyAvailable() {
  return spawnSync('agy', ['--version'], { shell: SHELL }).status === 0;
}

/**
 * A warning about the machine, not the plugin: `agy` checks an MCP server's command against the
 * PATH of whoever runs the validator, so a server whose tool is not installed here still passes.
 */
const MACHINE_WARNING = /isn't on this machine's PATH$/;

function validate(target) {
  // Windows runs `agy` (a .cmd shim) through cmd.exe, which joins the arguments unquoted, so a
  // path with spaces needs quotes. Plugin names are kebab-case (plugin-assemble.ts), so nothing
  // else in the path needs escaping.
  const arg = SHELL ? `"${target}"` : target;
  // `--json` instead of `--strict`: the same findings, so the machine-dependent warning can be
  // left out while every other warning still fails, as `--strict` would.
  const result = spawnSync('agy', ['plugin', 'validate', arg, '--json'], {
    shell: SHELL,
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trimEnd();
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    return { ok: false, output };
  }
  const failing = (report.findings ?? []).filter(
    finding =>
      finding.severity === 'error' ||
      (finding.severity === 'warning' && !MACHINE_WARNING.test(finding.message)),
  );
  return {
    ok: result.status === 0 && failing.length === 0,
    output: failing.map(f => `  ${f.severity}: ${f.file}: ${f.message}`).join('\n') || output,
  };
}

function main() {
  if (!agyAvailable()) {
    console.log(
      '- agy (Antigravity CLI) is not on PATH; skipping the Antigravity plugin validation.',
    );
    return;
  }
  if (!fs.existsSync(PLUGINS)) {
    console.error(
      `✗ ${path.relative(process.cwd(), PLUGINS)} not found; run npm run catalog:build first.`,
    );
    process.exit(1);
  }
  const targets = fs
    .readdirSync(PLUGINS, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(PLUGINS, entry.name));
  let failed = 0;
  for (const target of targets) {
    const result = validate(target);
    const label = path.relative(process.cwd(), target);
    if (!result.ok) {
      failed += 1;
      console.error(`✗ ${label}\n${result.output}`);
    } else {
      console.log(`✓ ${label}`);
    }
  }
  if (failed > 0) {
    console.error(`✗ agy plugin validate: ${failed} of ${targets.length} plugin(s) failed.`);
    process.exit(1);
  }
  console.log(`✓ agy plugin validate: ${targets.length} plugin(s) pass.`);
}

main();
