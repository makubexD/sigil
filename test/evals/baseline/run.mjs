// Baseline gate runner (README): the same model, with and without one artifact, on that artifact's
// requests. Every run costs money, so nothing here runs in CI and no stage starts without a cap.
//
//   node run.mjs --sigil <sigil checkout> --requests requests/<file>.json --stage screen|confirm|final
//                --model <model id> --cap <dollars> --expected <dollars per run>
//                --out runs/<name>.jsonl [--runs 3] [--only R1,R2] [--claude <stub.mjs>]
//
// Each run: a fresh project under the OS temp dir (a copy of the request's fixture, or an empty
// folder); in the `with` arm the artifact is installed from the checkout (`sigil add <id>`), in the
// `none` arm nothing is. Then `claude -p "<prompt>"` with stream-json output, project settings only.
// The record keeps the model the run reported, its cost, which skills and agents it called, and the
// scripted checks. Records already in --out are skipped, so an interrupted stage resumes. A run that
// ends in an API error, or that another model answered, is not recorded.
// --claude replaces the `claude` binary with a node script: selftest.mjs uses it to prove the whole
// runner without a model.
/* global process, console, setTimeout, clearTimeout */
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { requestProblems, runChecks } from './checks.mjs';

import { Budget, score, usable, sameModel, voteRequest, verdict, nextStage } from './decide.mjs';

const TIMEOUT_MS = 600_000;
const ARMS = ['none', 'with'];
const STAGES = ['screen', 'confirm', 'final'];

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const sigil = flag('sigil') && resolve(flag('sigil'));
const requestsFile = flag('requests') && resolve(flag('requests'));
const out = flag('out') && resolve(flag('out'));
const stage = flag('stage');
const model = flag('model');
const cap = Number(flag('cap'));
const expected = Number(flag('expected'));
const runs = Number(flag('runs', 3));
const only = flag('only')?.split(',');
const claudeStub = flag('claude') && resolve(flag('claude'));
if (!sigil || !requestsFile || !out || !model || !STAGES.includes(stage) || !cap || !expected) {
  console.error(
    'usage: node run.mjs --sigil <checkout> --requests <file.json> --stage screen|confirm|final ' +
      '--model <id> --cap <dollars> --expected <dollars per run> --out <file.jsonl> [--runs 3]',
  );
  process.exit(2);
}

const spec = JSON.parse(readFileSync(requestsFile, 'utf8'));
const problems = requestProblems(spec);
if (problems.length) {
  console.error(`${requestsFile} can't be run:\n  ${problems.join('\n  ')}`);
  process.exit(2);
}
const requests = spec.requests.filter(request => !only || only.includes(request.id));
const artifactName = spec.artifact.split('/').pop();
mkdirSync(dirname(out), { recursive: true });
const sha = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
  cwd: sigil,
  encoding: 'utf8',
}).stdout.trim();

const readRecords = () =>
  existsSync(out)
    ? readFileSync(out, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line))
    : [];
const key = r => `${r.request}#${r.arm}#${r.run}`;
const done = new Set(readRecords().map(key));
const budget = new Budget(cap, expected);
for (const record of readRecords()) budget.add(record.costUsd ?? 0);

/** A fresh project; in the `with` arm the artifact and what it depends on are installed. */
function prepare(request, arm, run) {
  const root = join(tmpdir(), 'sigil-baseline');
  mkdirSync(root, { recursive: true });
  // Long canonical path: an 8.3 short temp name makes the agent's permission check block writes.
  const dir = realpathSync.native(mkdtempSync(join(root, `${request.id}-${arm}-${run}-`)));
  if (request.fixture)
    cpSync(resolve(dirname(requestsFile), request.fixture), dir, { recursive: true });
  if (arm === 'with') {
    const add = spawnSync(
      process.execPath,
      [
        join(sigil, 'dist-cli', 'cli.js'),
        'add',
        spec.artifact,
        '--target',
        'claude',
        '--yes',
        '--project-dir',
        dir,
      ],
      { encoding: 'utf8' },
    );
    if (add.status !== 0) throw new Error(`sigil add ${spec.artifact} failed: ${add.stderr}`);
  }
  return dir;
}

/** One headless run: the model that answered, its cost, what it called, and its final answer. */
function claude(dir, prompt) {
  return new Promise(resolvePromise => {
    const child = spawn(
      claudeStub ? process.execPath : 'claude',
      [
        ...(claudeStub ? [claudeStub] : []),
        '-p',
        prompt,
        '--model',
        model,
        '--setting-sources',
        'project',
        '--permission-mode',
        'acceptEdits',
        '--allowedTools',
        'Bash(node:*)',
        'Bash(npm test:*)',
        '--output-format',
        'stream-json',
        '--verbose',
        '--no-session-persistence',
      ],
      // No shell: the prompt spans lines and quotes, which a shell would re-split.
      { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolvePromise(result);
    };
    const timer = setTimeout(() => finish({ error: 'timeout' }), TIMEOUT_MS);
    const called = [];
    let reportedModel = null;
    let buffer = '';
    child.stdout.on('data', chunk => {
      buffer += chunk;
      for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === 'system' && event.subtype === 'init')
          reportedModel = event.model ?? null;
        if (event.type === 'assistant') {
          for (const block of event.message?.content ?? []) {
            if (block.type !== 'tool_use') continue;
            if (block.name === 'Skill') called.push(String(block.input?.skill ?? ''));
            if (block.input?.subagent_type) called.push(String(block.input.subagent_type));
          }
        }
        if (event.type === 'result') {
          if (event.is_error || event.terminal_reason === 'api_error' || !event.num_turns) {
            finish({ error: String(event.result ?? 'api error').slice(0, 160) });
            return;
          }
          finish({
            reportedModel,
            costUsd: event.total_cost_usd ?? null,
            turns: event.num_turns,
            called,
            answer: String(event.result ?? ''),
          });
        }
      }
    });
    child.on('close', () => finish({ error: 'claude exited without a result' }));
  });
}

let stopped;
outer: for (const request of requests) {
  for (let run = 1; run <= runs; run++) {
    for (const arm of ARMS) {
      if (done.has(key({ request: request.id, arm, run }))) continue;
      stopped = budget.stopReason();
      if (stopped) break outer;
      const dir = prepare(request, arm, run);
      const result = await claude(dir, request.prompt);
      const label = `${request.id} ${arm}#${run}`;
      if (result.error) {
        console.log(`${label}: rejected (${result.error})`);
        continue;
      }
      // Cost is real even when the record is dropped.
      budget.add(result.costUsd ?? 0);
      if (!sameModel(result.reportedModel, model)) {
        console.log(`${label}: rejected (answered by ${result.reportedModel}, not ${model})`);
        continue;
      }
      const checks = runChecks(request.checks, {
        dir,
        answer: result.answer,
        base: dirname(requestsFile),
      });
      const record = {
        date: new Date().toISOString().slice(0, 10),
        artifact: spec.artifact,
        stage,
        request: request.id,
        quiet: Boolean(request.quiet),
        arm,
        run,
        sha,
        model,
        reportedModel: result.reportedModel,
        costUsd: result.costUsd,
        turns: result.turns,
        called: result.called,
        usedArtifact: result.called.includes(artifactName),
        checks,
        score: score(checks),
      };
      appendFileSync(out, `${JSON.stringify(record)}\n`);
      console.log(`${label}: ${record.score.toFixed(2)} ($${(result.costUsd ?? 0).toFixed(3)})`);
    }
  }
}

// Tally over every usable record in --out.
const records = usable(readRecords(), model);
const working = spec.requests.filter(request => !request.quiet);
const votes = working.map(request => voteRequest(records, request.id));
const quietRuns = records.filter(r => r.quiet && r.arm === 'with');
// A rule has nothing to call, so its quiet request is judged by its checks alone.
const quiet =
  quietRuns.length > 0 &&
  quietRuns.every(r => r.score === 1 && (spec.kind === 'rule' || !r.usedArtifact));
working.forEach((request, i) => console.log(`${request.id}: ${votes[i]}`));
const result = verdict(votes, quiet);
console.log(`quiet request held: ${quiet}`);
console.log(`spent: $${budget.spentUsd.toFixed(2)} of $${cap.toFixed(2)}`);
if (stopped) {
  console.log(`stopped: ${stopped}`);
  console.log(`${spec.artifact} (${stage}, ${model}): inconclusive, the stage did not finish`);
} else {
  const next = nextStage(result, stage);
  console.log(
    `${spec.artifact} (${stage}, ${model}): ${result}${next ? `; next stage: ${next}` : ''}`,
  );
}
