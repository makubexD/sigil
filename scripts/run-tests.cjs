/**
 * Runs the compiled test suite the same way on every supported Node version and OS.
 *
 * `npm test` used to hand `node --test` a quoted glob and `--test-coverage-exclude`. Node 20 (the
 * `engines` floor) rejects that flag (added in 22.5) and does not expand globs itself, and cmd.exe
 * does not either, so the Windows / Node 20 CI job failed before running a single test. This script
 * lists the files itself and adds the coverage exclusion only where Node supports it.
 *
 * Two environment knobs, both for measuring and for CI tuning:
 * - `SIGIL_TEST_COVERAGE=0` skips `--experimental-test-coverage` (default: on).
 * - `SIGIL_TEST_CONCURRENCY=<n>` sets `--test-concurrency` (default: one test file per CPU, `os.availableParallelism()`).
 *
 * Run: node scripts/run-tests.cjs   (after `npm run build && npm run build:test`; `npm test` does both)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = 'test-compiled';
const MIN_MAJOR_WITH_EXCLUDE = 22;
const MIN_MINOR_WITH_EXCLUDE = 5;

/** Every `*.test.js` under `dir`, recursively, in a stable order. */
function testFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return testFiles(full);
      return entry.name.endsWith('.test.js') ? [full] : [];
    })
    .sort();
}

function supportsCoverageExclude() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  return (
    major > MIN_MAJOR_WITH_EXCLUDE ||
    (major === MIN_MAJOR_WITH_EXCLUDE && minor >= MIN_MINOR_WITH_EXCLUDE)
  );
}

const files = testFiles(ROOT);
if (files.length === 0) {
  console.error(`No test files found under ${ROOT}/. Run \`npm run build:test\` first.`);
  process.exit(1);
}

const QUIET_CONSOLE = path.resolve(__dirname, 'quiet-console.cjs');

const args = ['--require', QUIET_CONSOLE, '--test'];
if (process.env.SIGIL_TEST_COVERAGE !== '0') {
  args.push('--experimental-test-coverage');
  if (supportsCoverageExclude()) args.push(`--test-coverage-exclude=${ROOT}/**`);
}
// Node's default is CPUs - 1. One test file per CPU measured faster on the 4-vCPU Windows runner
// (37 s against 50-56 s at 5 to 8 files, 3 runs each) and no slower on Ubuntu.
const requested = Number.parseInt(process.env.SIGIL_TEST_CONCURRENCY ?? '', 10);
const concurrency = requested > 0 ? requested : os.availableParallelism();
args.push(`--test-concurrency=${concurrency}`);
const result = spawnSync(process.execPath, [...args, ...files], { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);
