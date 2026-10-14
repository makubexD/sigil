// Blind readability and minimalism judge for two arms of the code-quality eval (see key.md, Judge).
//
//   node judge.mjs <baseline.jsonl> <candidate.jsonl> [--model claude-sonnet-5-5] [--out runs/judge-x.jsonl]
//
// For each (task, run) pair present in both arms, it shows the judge the task prompt and the two
// archived source folders (runs/<records file>/<task>-<run>/) as X and Y in random order, with no
// arm names, and asks for 0-4 scores. It unblinds, appends one record per pair, and reports a
// one-sided sign test on readability: does the judge prefer the baseline?
/* global process, console */
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const [fileA, fileB] = args.filter(a => a.endsWith('.jsonl')).map(f => resolve(f));
const model = flag('model', 'claude-sonnet-5-5');
const out = flag('out') && resolve(flag('out'));
if (!fileA || !fileB) {
  console.error('usage: node judge.mjs <baseline.jsonl> <candidate.jsonl> [--model M] [--out F]');
  process.exit(2);
}

const prompts = Object.fromEntries(
  readFileSync(join(here, 'scenarios.md'), 'utf8')
    .split(/^## /m)
    .slice(1)
    .map(s => [
      /^(T\d)\b/.exec(s)?.[1],
      s
        .split(/\r?\n/)
        .filter(l => l.startsWith('>'))
        .map(l => l.replace(/^> ?/, ''))
        .join('\n'),
    ])
    .filter(([id]) => id),
);

const records = file =>
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(l => JSON.parse(l));

function source(file, task, run) {
  const dir = join(file.replace(/\.jsonl$/, ''), `${task}-${run}`);
  if (!existsSync(dir)) return undefined;
  return readdirSync(dir)
    .filter(f => f.endsWith('.ts'))
    .sort()
    .map(f => `// file: src/${f}\n${readFileSync(join(dir, f), 'utf8')}`)
    .join('\n\n');
}

function ask(task, x, y) {
  const prompt = [
    'You are judging two solutions to the same coding task. Do not use any tools.',
    `The task:\n${prompts[task]}`,
    `Solution X:\n\`\`\`ts\n${x}\n\`\`\``,
    `Solution Y:\n\`\`\`ts\n${y}\n\`\`\``,
    'Score each solution 0-4 on:',
    '- readability: could a new team member follow it in one pass (names, structure, comments that explain why)?',
    '- minimalism: does it do what was asked, without options, types, helpers or layers nobody needed?',
    'Reply with only this JSON: {"X":{"readability":n,"minimalism":n},"Y":{"readability":n,"minimalism":n}}',
  ].join('\n\n');
  const cwd = realpathSync.native(mkdtempSync(join(tmpdir(), 'sigil-cq-judge-')));
  const result = spawnSync(
    'claude',
    [
      '-p',
      prompt,
      '--model',
      model,
      '--setting-sources',
      'project',
      '--output-format',
      'json',
      '--no-session-persistence',
    ],
    { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  const reply = JSON.parse(result.stdout);
  if (reply.is_error || reply.terminal_reason === 'api_error')
    throw new Error(`judge API error: ${reply.terminal_reason}`);
  const json = /\{[\s\S]*\}/.exec(reply.result)?.[0];
  return { scores: JSON.parse(json), costUsd: reply.total_cost_usd ?? null };
}

function signTestP(wins, n) {
  let p = 0;
  let coef = 1;
  for (let k = 0; k <= n; k++) {
    if (k >= wins) p += coef / 2 ** n;
    coef = (coef * (n - k)) / (k + 1);
  }
  return p;
}

const baseline = new Map(records(fileA).map(r => [`${r.task}#${r.run}`, r]));
let baselineBetter = 0;
let candidateBetter = 0;
let ties = 0;
for (const cand of records(fileB)) {
  const base = baseline.get(`${cand.task}#${cand.run}`);
  if (!base) continue;
  const a = source(fileA, cand.task, cand.run);
  const b = source(fileB, cand.task, cand.run);
  if (!a || !b) {
    console.error(`${cand.task}#${cand.run}: no archived source, skipped`);
    continue;
  }
  const swap = Math.random() < 0.5;
  const { scores, costUsd } = ask(cand.task, swap ? b : a, swap ? a : b);
  const baseScore = swap ? scores.Y : scores.X;
  const candScore = swap ? scores.X : scores.Y;
  if (baseScore.readability > candScore.readability) baselineBetter++;
  else if (baseScore.readability < candScore.readability) candidateBetter++;
  else ties++;
  const record = {
    task: cand.task,
    run: cand.run,
    model,
    baseline: baseScore,
    candidate: candScore,
    costUsd,
  };
  if (out) appendFileSync(out, `${JSON.stringify(record)}\n`);
  console.log(
    `${cand.task}#${cand.run}: baseline ${JSON.stringify(baseScore)} candidate ${JSON.stringify(candScore)}`,
  );
}
const decided = baselineBetter + candidateBetter;
console.log(
  `\nreadability: baseline better ${baselineBetter}, candidate better ${candidateBetter}, ties ${ties}` +
    `\none-sided sign test (judge prefers baseline) p = ${decided ? signTestP(baselineBetter, decided).toPrecision(3) : 'n/a'}`,
);
