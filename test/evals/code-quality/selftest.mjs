// Checks the code-quality eval can tell good from bad before any arm is compared (README, Selftest).
//
//   node selftest.mjs     (run by `npm run evals:check`; needs no model and no network)
//
// 1. The statistics in stats.cjs return hand-computed exact p-values.
// 2. Each task's bad reference (badrefs.json: a passing solution with one hidden-checked behaviour
//    broken, or T3's unfixed start) fails the hidden check named in `fails` and passes others, so
//    the hidden tests catch the defect itself, not a crash or a slow machine. A trap task's good
//    reference (fixture-good/<task>/) passes every hidden check.
/* global process, console */
import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hiddenTests } from './measure.mjs';
import { prompts } from './scenarios.mjs';

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

// Every task run.mjs can be asked for is complete: a prompt naming its files, hidden tests, a
// surface and a bad reference.
const surfaces = JSON.parse(readFileSync(join(here, 'surface.json'), 'utf8'));
const allBadrefs = JSON.parse(readFileSync(join(here, 'badrefs.json'), 'utf8'));
const taskPrompts = prompts();
const incomplete = [];
for (const [task, surface] of Object.entries(surfaces)) {
  const prompt = taskPrompts[task];
  if (!prompt) incomplete.push(`${task}: no prompt in scenarios.md`);
  for (const file of surface.files)
    if (prompt && !prompt.includes(file)) incomplete.push(`${task}: prompt never names ${file}`);
  if (!existsSync(join(here, 'fixture-hidden', task))) incomplete.push(`${task}: no hidden tests`);
  if (!allBadrefs[task]) incomplete.push(`${task}: no bad reference`);
}
for (const task of Object.keys(taskPrompts))
  if (!surfaces[task]) incomplete.push(`${task}: prompt without a surface`);
assert.deepEqual(incomplete, [], 'every task must be complete');

// Hidden tests are TypeScript run by Node's type stripping (Node 22.7+, like the eval itself). On an
// older Node only the statistics are checked; CI's Node 22 job runs the bad references.
const canRunHidden = process.allowedNodeEnvironmentFlags.has('--experimental-transform-types');
if (!canRunHidden)
  console.log(
    `bad references skipped: Node ${process.version} lacks --experimental-transform-types`,
  );
const badrefs = canRunHidden ? JSON.parse(readFileSync(join(here, 'badrefs.json'), 'utf8')) : {};

/** Hidden-test results for `source` written to `ref.to` in a fresh fixture copy (null: the start). */
function hiddenFor(task, ref, source) {
  const dir = mkdtempSync(join(tmpdir(), `cq-ref-${task}-`));
  try {
    cpSync(join(here, 'fixture'), dir, { recursive: true });
    const start = join(here, 'fixture-start', task);
    if (existsSync(start)) cpSync(start, dir, { recursive: true });
    if (source !== null) {
      mkdirSync(dirname(join(dir, ref.to)), { recursive: true });
      writeFileSync(join(dir, ref.to), source);
    }
    return hiddenTests(dir, task);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const failures = [];
for (const [task, ref] of Object.entries(badrefs)) {
  const good = ref.from && readFileSync(join(here, ref.from), 'utf8').replace(/\r\n/g, '\n');
  // A committed good reference (fixture-good/) must pass every check; archived run outputs
  // (runs/) are not re-checked, since T5's timing check can fail them on a busy machine.
  if (ref.from?.startsWith('fixture-good/')) {
    const result = hiddenFor(task, ref, good);
    console.log(`${task} good reference: pass ${result.pass}, fail ${result.fail}`);
    if (result.fail > 0 || result.pass === 0)
      failures.push(`${task}: good reference failed: ${result.failedTests.join(' | ')}`);
  }
  if (good && !good.includes(ref.replace[0]))
    failures.push(`${task}: mutation no longer matches ${ref.from}`);
  const result = hiddenFor(task, ref, good ? good.replace(...ref.replace) : null);
  const line = `${task} (${ref.breaks}): pass ${result.pass}, fail ${result.fail}`;
  console.log(line);
  // The named check must be among the failures: a timing check failing alone proves nothing.
  if (!result.failedTests.includes(ref.fails) || result.pass === 0)
    failures.push(
      `${line}; expected "${ref.fails}" to fail, failed: ${result.failedTests.join(' | ')}`,
    );
}
assert.deepEqual(failures, [], 'every reference must behave as badrefs.json says');
console.log('selftest ok');
