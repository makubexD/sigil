// Checks the baseline gate can tell a useful artifact from a useless one before any model is paid
// (README, Selftest).
//
//   node selftest.mjs     (run by `npm run evals:check`; needs no model and no network)
//
// 1. decide.mjs: votes, verdicts, the outcome table, the model filter and the budget stops, on
//    hand-built records.
// 3. run.mjs end to end, with stub-claude.mjs in place of the model: the example artifact comes out
//    `beats` when the stub does better with it installed, and the stage stops at a cap of one run.
//    Needs a current dist-cli/ (npm run build), like the rest of `npm run evals:check`.
// 2. checks.mjs: every check kind passes on a project that satisfies it and fails on one that
//    doesn't, and a request file that breaks the protocol is refused.
/* global console, process */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CHECK_KINDS, requestProblems, runChecks } from './checks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
import {
  Budget,
  PRICE_CHECK_RUNS,
  action,
  nextStage,
  sameModel,
  score,
  usable,
  verdict,
  voteRequest,
} from './decide.mjs';

const MODEL = 'claude-haiku-5-5';
const REQUESTS = ['R1', 'R2', 'R3', 'R4', 'R5'];
/** Three runs per arm of every request, with fixed scores per arm. */
const records = (withScore, noneScore, reportedModel = MODEL) =>
  REQUESTS.flatMap(request =>
    [1, 2, 3].flatMap(run => [
      { request, arm: 'with', run, model: MODEL, reportedModel, score: withScore },
      { request, arm: 'none', run, model: MODEL, reportedModel, score: noneScore },
    ]),
  );
const votesOf = recs => REQUESTS.map(request => voteRequest(recs, request));

// A known-good artifact: every request passes with it and fails without.
const good = votesOf(records(1, 0));
assert.deepEqual(good, ['win', 'win', 'win', 'win', 'win']);
assert.equal(verdict(good, true), 'beats');
assert.equal(action('beats'), 'keep');
assert.equal(nextStage('beats', 'screen'), 'confirm');
assert.equal(nextStage('beats', 'confirm'), 'final');
assert.equal(nextStage('beats', 'final'), undefined);
// It wins every request but acts on the one it must stay quiet for: not a keep.
assert.equal(verdict(good, false), 'ties');

// A known-useless artifact: the same result either way.
const useless = votesOf(records(1, 1));
assert.deepEqual(useless, ['tie', 'tie', 'tie', 'tie', 'tie']);
assert.equal(verdict(useless, true), 'ties');
assert.equal(nextStage('ties', 'screen'), undefined);
assert.equal(action('ties'), 'opt-in; delete on a second tie');
assert.equal(action('ties', { priorTie: true }), 'delete (owner confirms)');
assert.equal(action('ties', { fieldUses: 3 }), 'opt-in, re-test');
assert.equal(action('ties', { holdsFact: true, fieldUses: 3 }), 'keep, cut to that fact');

// A harmful one, a near miss, and too little data.
assert.equal(verdict(votesOf(records(0, 1)), true), 'worse');
assert.equal(action('worse'), 'opt-in, reword and re-test');
assert.equal(verdict(['win', 'win', 'win', 'win', 'tie'], true), 'ties', '4 of 4 is p = 1/16');
assert.equal(verdict(['win', 'win', 'win', 'win', 'loss'], true), 'ties', '4 of 5 is p = 6/32');
assert.equal(verdict(['win', 'win', 'win', 'win'], true), 'inconclusive');
assert.equal(verdict(['win', 'win', 'win', 'win', 'missing'], true), 'inconclusive');
assert.equal(action('inconclusive'), 'nothing moves');

// A difference inside the tie margin is a tie; a request with one arm missing is not voted.
assert.equal(voteRequest(records(0.98, 0.95), 'R1'), 'tie');
assert.equal(
  voteRequest(
    records(1, 0).filter(r => r.arm === 'with'),
    'R1',
  ),
  'missing',
);

// Runs another model answered are dropped, so they cannot vote.
assert.equal(usable(records(1, 0, 'claude-sonnet-5-5'), MODEL).length, 0);
assert.equal(usable(records(1, 0), MODEL).length, 30);
assert.equal(
  usable(records(1, 0, `${MODEL}-20261001`), MODEL).length,
  30,
  'a dated id is the same model',
);
assert.equal(sameModel(`${MODEL}-fast`, MODEL), false);
assert.equal(sameModel(null, MODEL), false);

assert.equal(score([{ pass: true }, { pass: false }]), 0.5);
assert.throws(() => score([]), RangeError);

// Budget: stops at the cap, and at the price check when the first runs cost over twice the estimate.
const capped = new Budget(1, 0.5);
capped.add(0.6);
assert.equal(capped.stopReason(), undefined);
capped.add(0.6);
assert.match(capped.stopReason(), /^cap reached/);
const pricey = new Budget(100, 0.01);
for (let i = 0; i < PRICE_CHECK_RUNS; i++) pricey.add(0.05);
assert.match(pricey.stopReason(), /^price check failed/);
const fair = new Budget(100, 0.01);
for (let i = 0; i < PRICE_CHECK_RUNS; i++) fair.add(0.015);
assert.equal(fair.stopReason(), undefined);
assert.throws(() => new Budget(0, 0.01), RangeError);

// Checks: each kind passes on `good/` and fails on `bad/`.
const root = mkdtempSync(join(tmpdir(), 'sigil-baseline-selftest-'));
try {
  const project = (name, source, test) => {
    const dir = join(root, name);
    mkdirSync(join(dir, 'src'), { recursive: true });
    mkdirSync(join(dir, '.claude', 'skills'), { recursive: true });
    writeFileSync(join(dir, 'src', 'sum.js'), source);
    writeFileSync(join(dir, 'check.js'), test);
    // A catalog file never counts as the run's own work.
    writeFileSync(join(dir, '.claude', 'skills', 'sum.test.js'), 'installed, not written');
    return dir;
  };
  const goodDir = project('good', 'exports.sum = (a, b) => a + b;\n', 'process.exit(0);\n');
  writeFileSync(join(goodDir, 'src', 'sum.test.js'), "require('./sum');\n");
  const badDir = project(
    'bad',
    'exports.sum = (a, b) => eval(`${a}+${b}`);\n',
    'process.exit(1);\n',
  );
  const checks = [
    { id: 'has-test', kind: 'file-exists', glob: '**/*.test.js' },
    { id: 'exports-sum', kind: 'file-matches', glob: 'src/*.js', pattern: 'a \\+ b' },
    { id: 'no-eval', kind: 'file-lacks', glob: 'src/**/*.js', pattern: '\\beval\\(' },
    { id: 'says-tested', kind: 'answer-matches', pattern: 'tests? pass' },
    { id: 'no-apology', kind: 'answer-lacks', pattern: 'could not' },
    { id: 'gate', kind: 'command', command: 'node', args: ['check.js'] },
  ];
  assert.deepEqual(checks.map(check => check.kind).sort(), [...CHECK_KINDS].sort());
  const passed = runChecks(checks, { dir: goodDir, answer: 'Added it; the tests pass.' });
  assert.deepEqual(
    passed.map(check => check.pass),
    [true, true, true, true, true, true],
  );
  const failed = runChecks(checks, { dir: badDir, answer: 'I could not run anything.' });
  assert.deepEqual(
    failed.map(check => check.pass),
    [false, false, false, false, false, false],
  );
  assert.throws(() => runChecks([{ id: 'x', kind: 'nope' }], { dir: goodDir, answer: '' }));
} finally {
  rmSync(root, { recursive: true, force: true });
}

// The example request file follows the protocol; broken ones are refused with the reason.
const example = JSON.parse(readFileSync(join(here, 'requests', 'example.json'), 'utf8'));
assert.deepEqual(requestProblems(example), []);
const naming = JSON.parse(JSON.stringify(example));
naming.requests[0].prompt = `Use ${example.artifact.split('/').pop()} on this file.`;
assert.match(requestProblems(naming).join('\n'), /the prompt names/);
const short = { ...example, requests: example.requests.slice(0, 3) };
assert.match(requestProblems(short).join('\n'), /working requests, want 5/);
const noQuiet = { ...example, requests: example.requests.filter(request => !request.quiet) };
assert.match(requestProblems(noQuiet).join('\n'), /want 1 quiet/);

// The runner, end to end, on a stub that does better when the skill is installed.
const repo = join(here, '..', '..', '..');
const runRoot = mkdtempSync(join(tmpdir(), 'sigil-baseline-run-'));
const stage = (name, cap) =>
  spawnSync(
    process.execPath,
    [
      join(here, 'run.mjs'),
      ...['--sigil', repo, '--requests', join(here, 'requests', 'example.json')],
      ...['--stage', 'screen', '--model', MODEL, '--cap', cap, '--expected', '0.01', '--runs', '1'],
      ...['--out', join(runRoot, `${name}.jsonl`), '--claude', join(here, 'stub-claude.mjs')],
    ],
    { encoding: 'utf8' },
  );
try {
  const full = stage('full', '1');
  assert.equal(full.status, 0, full.stderr);
  assert.match(
    full.stdout,
    /python\/py-generate-tests \(screen, claude-haiku-5-5\): beats; next stage: confirm/,
  );
  assert.match(full.stdout, /quiet request held: true/);
  assert.match(full.stdout, /spent: \$0\.12 of \$1\.00/);
  const cut = stage('cut', '0.01');
  assert.match(cut.stdout, /stopped: cap reached/);
  assert.match(cut.stdout, /inconclusive, the stage did not finish/);
  assert.equal(readFileSync(join(runRoot, 'cut.jsonl'), 'utf8').trim().split('\n').length, 1);
} finally {
  rmSync(runRoot, { recursive: true, force: true });
}

console.log('baseline selftest ok');
