// Checks the code-quality eval can tell good from bad before any arm is compared (README, Selftest).
//
//   node selftest.mjs     (run by `npm run evals:check`; needs no model and no network)
//
// 1. The statistics in stats.cjs return hand-computed exact p-values.
// 2. Each task's bad reference (badrefs.json: a passing archived solution with one hidden-checked
//    behaviour broken, or T3's unfixed start) fails the hidden check named in `fails` and passes
//    others, so the hidden tests catch the defect itself, not a crash or a slow machine.
/* global console */
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hiddenTests } from './measure.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const { signTestP, signFlipP } = createRequire(import.meta.url)('./stats.cjs');

const close = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);
close(signTestP(4, 5), 6 / 32, 'sign test, 4 of 5');
close(signTestP(0, 3), 1, 'sign test, 0 of 3');
close(signFlipP([1, 1, 1, 1, 1]), 1 / 32, 'sign-flip, 5 equal wins');
// D2 vs B1 declarations per task (results.md, task-level re-reading): 4 lower, 1 tie, 1 higher.
close(signFlipP([4, 4, 0, 3, 16 / 3, -8 / 3]), 4 / 64, 'sign-flip, D2 vs B1');
close(signFlipP([]), 1, 'sign-flip, no tasks');

const badrefs = JSON.parse(readFileSync(join(here, 'badrefs.json'), 'utf8'));
const failures = [];
for (const [task, ref] of Object.entries(badrefs)) {
  const dir = mkdtempSync(join(tmpdir(), `cq-bad-${task}-`));
  try {
    cpSync(join(here, 'fixture'), dir, { recursive: true });
    if (task === 'T3') cpSync(join(here, 'fixture-start', 'T3'), dir, { recursive: true });
    if (ref.from) {
      const good = readFileSync(join(here, ref.from), 'utf8').replace(/\r\n/g, '\n');
      const [from, to] = ref.replace;
      if (!good.includes(from)) failures.push(`${task}: mutation no longer matches ${ref.from}`);
      mkdirSync(dirname(join(dir, ref.to)), { recursive: true });
      writeFileSync(join(dir, ref.to), good.replace(from, to));
    }
    const result = hiddenTests(dir, task);
    const line = `${task} (${ref.breaks}): pass ${result.pass}, fail ${result.fail}`;
    console.log(line);
    // The named check must be among the failures: a timing check failing alone proves nothing.
    if (!result.failedTests.includes(ref.fails) || result.pass === 0)
      failures.push(
        `${line}; expected "${ref.fails}" to fail, failed: ${result.failedTests.join(' | ')}`,
      );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
assert.deepEqual(failures, [], 'every bad reference must fail its named check and pass others');
console.log('selftest ok');
