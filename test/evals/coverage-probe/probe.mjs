// Coverage probe (README): does an unguided model get C1–C5 right when no catalog rule or skill is
// loaded? Audit row 18 — probe the baseline first, so prose is written only for what it gets wrong.
//
//   node probe.mjs --out runs/<name>.jsonl [--runs 3] [--only K1,K2] [--parallel 3]
//                  [--model claude-haiku-5-5]
//
// Each run: a fresh empty folder under the OS temp dir, then `claude -p "<prompt>"` with project
// settings only, edits accepted, and only Write/Edit/Read/Glob/Grep available (nothing is
// installed, and the code is never run). The files the run produced are copied to
// <out dir>/<out name>/<task>-<run>/ and one record is appended to --out. Records that already
// exist are skipped, so a batch interrupted by a usage limit resumes. A run that ends in an API or
// usage-limit error is not recorded. Up to --parallel runs go at once.
/* global process, console, setTimeout, clearTimeout */
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TIMEOUT_MS = 900_000;
const SKIP_DIRS = new Set(['node_modules', '.git', 'bin', 'obj', '__pycache__']);

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const out = flag('out') && resolve(flag('out'));
const runs = Number(flag('runs', 3));
const parallel = Number(flag('parallel', 3));
const model = flag('model', 'claude-haiku-5-5');
const only = flag('only')?.split(',');
if (!out) {
  console.error(
    'usage: node probe.mjs --out <file.jsonl> [--runs 3] [--only K1,K2] [--parallel 3] [--model claude-haiku-5-5]',
  );
  process.exit(2);
}
// Records are appended as runs finish: the folder must exist before the first one.
mkdirSync(dirname(out), { recursive: true });
// The archive sits beside --out: runs/stage1.jsonl -> runs/stage1/K1-1/.
const archiveRoot = join(dirname(out), basename(out, '.jsonl'));

const prompts = JSON.parse(readFileSync(join(here, 'prompts.json'), 'utf8')).filter(
  p => !only || only.includes(p.id),
);
const cli = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? '';
const readRecords = () =>
  existsSync(out)
    ? readFileSync(out, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line))
    : [];
const done = new Set(readRecords().map(r => `${r.task}#${r.run}`));

/** Run the prompt in dir; resolves to the parsed result JSON, or why it was not recorded. */
function ask(dir, prompt) {
  return new Promise(resolvePromise => {
    const child = spawn(
      'claude',
      [
        '-p',
        prompt,
        '--model',
        model,
        '--setting-sources',
        'project',
        '--permission-mode',
        'acceptEdits',
        '--allowedTools',
        'Write',
        'Edit',
        'Read',
        'Glob',
        'Grep',
        '--output-format',
        'json',
        '--no-session-persistence',
      ],
      { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ error: 'timeout' });
    }, TIMEOUT_MS);
    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => (stderr += chunk));
    child.on('error', err => finish({ error: err.message }));
    child.on('close', () => {
      let result;
      try {
        result = JSON.parse(stdout);
      } catch {
        finish({ error: `no result JSON (${stderr.trim().slice(0, 160) || 'no stderr'})` });
        return;
      }
      const text = String(result.result ?? result.subtype ?? '');
      if (
        result.is_error ||
        result.terminal_reason === 'api_error' ||
        /usage limit|rate limit/i.test(text)
      ) {
        finish({ error: text.slice(0, 160) || 'api error' });
        return;
      }
      finish({ result });
    });
  });
}

/** Copy the run's files to the archive; returns their relative paths. */
function archive(dir, task, run) {
  const files = [];
  const walk = (folder, prefix) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(folder, entry.name), relative);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  };
  walk(dir, '');
  files.sort();
  const target = join(archiveRoot, `${task}-${run}`);
  for (const relative of files) {
    const destination = join(target, relative);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(dir, relative), destination);
  }
  return files;
}

const pending = [];
for (const prompt of prompts) {
  for (let run = 1; run <= runs; run++) {
    if (!done.has(`${prompt.id}#${run}`)) pending.push({ prompt, run });
  }
}

/** Take the next queued (prompt, run), so --parallel workers share the batch. */
async function worker() {
  for (let job = pending.shift(); job; job = pending.shift()) {
    const { prompt, run } = job;
    const dir = mkdtempSync(join(tmpdir(), 'sigil-coverage-'));
    const { result, error } = await ask(dir, prompt.prompt);
    if (error) {
      console.log(`${prompt.id}#${run}: rejected (${error})`);
      continue;
    }
    const files = archive(dir, prompt.id, run);
    appendFileSync(
      out,
      `${JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        task: prompt.id,
        area: prompt.area,
        run,
        model,
        cli,
        costUsd: result.total_cost_usd ?? null,
        turns: result.num_turns ?? null,
        durationMs: result.duration_ms ?? null,
        files,
      })}\n`,
    );
    console.log(`${prompt.id}#${run}: recorded (${files.length} files)`);
  }
}

await Promise.all(Array.from({ length: Math.max(1, parallel) }, () => worker()));
