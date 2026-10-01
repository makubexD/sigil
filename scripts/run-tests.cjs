/**
 * Runs the compiled test suite the same way on every supported Node version and OS.
 *
 * `npm test` used to hand `node --test` a quoted glob and `--test-coverage-exclude`. Node 20 (the
 * `engines` floor) rejects that flag (added in 22.5) and does not expand globs itself, and cmd.exe
 * does not either, so the Windows / Node 20 CI job failed before running a single test. This script
 * lists the files itself and adds the coverage exclusion only where Node supports it.
 *
 * Run: node scripts/run-tests.cjs   (after `npm run build && npm run build:test`; `npm test` does both)
 */
const fs = require('fs');
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

const args = ['--test', '--experimental-test-coverage'];
if (supportsCoverageExclude()) args.push(`--test-coverage-exclude=${ROOT}/**`);
const result = spawnSync(process.execPath, [...args, ...files], { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);
