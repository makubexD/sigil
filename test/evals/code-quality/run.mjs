// Runs one arm of the code-quality eval headless and appends one record per run (see README.md).
//
//   node run.mjs --arm current --sigil <sigil checkout> --out runs/b0.jsonl
//                [--tasks T1,T2,...] [--runs 3] [--first-run 1] [--parallel 3]
//                [--model claude-opus-5-5] [--install rules|none]
//
// Each run: a fresh copy of fixture/ (plus fixture-start/<task>/) under the OS temp dir, the arm's
// install (`sigil add kind:rule --language typescript --target claude` from the given checkout, or
// nothing), `claude -p "<prompt>"` with only project settings, then measure.mjs. The prompt is the
// task's quoted block in scenarios.md, verbatim.
/* global process, console */
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const arm = flag('arm');
const sigil = flag('sigil') && resolve(flag('sigil'));
const out = flag('out') && resolve(flag('out'));
const tasks = flag('tasks', 'T1,T2,T3,T4,T5,T6').split(',');
const runs = Number(flag('runs', 3));
const firstRun = Number(flag('first-run', 1));
const parallel = Number(flag('parallel', 3));
const model = flag('model', 'claude-opus-5-5');
const install = flag('install', 'rules');
if (!arm || !out || (install !== 'none' && !sigil)) {
  console.error('usage: node run.mjs --arm <name> --out <file.jsonl> [--sigil <checkout>] [...]');
  process.exit(2);
}

/** The quoted prompt under each `## Tn ...` heading of scenarios.md. */
function prompts() {
  const text = readFileSync(join(here, 'scenarios.md'), 'utf8');
  const result = {};
  for (const section of text.split(/^## /m).slice(1)) {
    const id = /^(T\d)\b/.exec(section)?.[1];
    if (!id) continue;
    result[id] = section
      .split(/\r?\n/)
      .filter(line => line.startsWith('>'))
      .map(line => line.replace(/^> ?/, ''))
      .join('\n')
      .trim();
  }
  return result;
}

const sha = sigil
  ? spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: sigil,
      encoding: 'utf8',
    }).stdout.trim()
  : null;
const PROMPTS = prompts();

function prepare(task, run) {
  const root = join(tmpdir(), 'sigil-cq-eval');
  mkdirSync(root, { recursive: true });
  // Long canonical path: on Windows tmpdir() can be an 8.3 short name (KIEFER~1.FER), which the
  // agent's permission check treats as a different, suspicious location and blocks every write.
  const dir = realpathSync.native(mkdtempSync(join(root, `${arm}-${task}-${run}-`)));
  cpSync(join(here, 'fixture'), dir, { recursive: true });
  const start = join(here, 'fixture-start', task);
  if (existsSync(start)) cpSync(start, dir, { recursive: true });
  if (install === 'rules') {
    const add = spawnSync(
      process.execPath,
      [
        join(sigil, 'dist-cli', 'cli.js'),
        'add',
        'kind:rule',
        '--language',
        'typescript',
        '--target',
        'claude',
        '--yes',
        '--project-dir',
        dir,
      ],
      { encoding: 'utf8' },
    );
    if (add.status !== 0) throw new Error(`sigil add failed: ${add.stderr}`);
  }
  return dir;
}

function claude(dir, task) {
  return new Promise(resolvePromise => {
    const child = spawn(
      'claude',
      [
        '-p',
        PROMPTS[task],
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
        'json',
        '--no-session-persistence',
      ],
      // No shell: the prompt spans lines and quotes, which a shell would re-split.
      { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    child.stdout.on('data', chunk => (stdout += chunk));
    child.on('close', () => {
      writeFileSync(join(dir, 'claude-output.json'), stdout);
      let json;
      try {
        json = JSON.parse(stdout);
      } catch {
        resolvePromise({ error: `unparseable output: ${stdout.slice(0, 200)}` });
        return;
      }
      // An API error (usage limit, outage) is not a result: the run never worked on the task.
      if (json.is_error || json.terminal_reason === 'api_error' || !json.num_turns) {
        resolvePromise({
          error: `${json.terminal_reason ?? 'error'}: ${String(json.result ?? '').slice(0, 160)}`,
        });
        return;
      }
      resolvePromise({
        costUsd: json.total_cost_usd ?? null,
        turns: json.num_turns,
        durationMs: json.duration_ms ?? null,
      });
    });
  });
}

/** `runs/<records file name without .jsonl>/`: one `<task>-<run>/` folder of source per run. */
function archiveDir() {
  return out.replace(/\.jsonl$/, '');
}

async function one(task, run) {
  const dir = prepare(task, run);
  const meta = await claude(dir, task);
  if (meta.error) throw new Error(`invalid run, not recorded (re-run it): ${meta.error}`);
  const measured = spawnSync(
    process.execPath,
    [
      join(here, 'measure.mjs'),
      'run',
      dir,
      '--task',
      task,
      '--arm',
      arm,
      '--run',
      String(run),
      '--model',
      model,
      ...(sha ? ['--sha', sha] : []),
    ],
    { encoding: 'utf8' },
  );
  // The run directory is a local path (user name included): printed, never recorded.
  const record = { ...JSON.parse(measured.stdout.trim().split(/\r?\n/).pop()), ...meta };
  appendFileSync(out, `${JSON.stringify(record)}\n`);
  // Keep the produced source next to the records, for the judge and for later reading.
  if (existsSync(join(dir, 'src'))) {
    cpSync(join(dir, 'src'), join(archiveDir(), `${task}-${run}`), { recursive: true });
  }
  console.log(
    `${arm} ${task}#${run}: tests ${record.pass}/${record.pass + record.fail}, loc ${record.loc}, declarations ${record.declarations}, inflation ${record.inflation} (${dir})`,
  );
}

const queue = tasks.flatMap(task => Array.from({ length: runs }, (_, i) => [task, firstRun + i]));
const workers = Array.from({ length: parallel }, async () => {
  while (queue.length) {
    const [task, run] = queue.shift();
    await one(task, run).catch(err =>
      console.error(`${arm} ${task}#${run} failed: ${err.message}`),
    );
  }
});
await Promise.all(workers);
