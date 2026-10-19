// Agent dispatch probe (README): which installed agent the model picks for a request that does not
// name one.
//
//   node probe.mjs --sigil <sigil checkout> --out runs/<name>.jsonl [--runs 3] [--only P1,P5]
//                  [--model claude-opus-5-5]
//
// Each run: a fresh copy of ../code-quality/fixture-review under the OS temp dir, every TypeScript
// agent installed from the given checkout (`sigil add kind:agent --language typescript`, which also
// brings the shared agents), then `claude -p "<prompt> <SUFFIX>"` with stream-json output. The
// process is stopped at the first subagent call, so a run costs one model turn or a few. Records
// that already exist in --out are skipped, so a run interrupted by a usage limit resumes. A run that
// ends in an API error is not recorded.
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
import { fileURLToPath } from 'node:url';

const SUFFIX = 'Use the most suitable subagent.';
const TIMEOUT_MS = 300_000;

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const sigil = flag('sigil') && resolve(flag('sigil'));
const out = flag('out') && resolve(flag('out'));
const runs = Number(flag('runs', 3));
const model = flag('model', 'claude-opus-5-5');
const only = flag('only')?.split(',');
if (!sigil || !out) {
  console.error(
    'usage: node probe.mjs --sigil <checkout> --out <file.jsonl> [--runs 3] [--only P1,P2]',
  );
  process.exit(2);
}
// Records are appended as runs finish: the folder must exist before the first one.
mkdirSync(dirname(out), { recursive: true });

const prompts = JSON.parse(readFileSync(join(here, 'prompts.json'), 'utf8')).filter(
  p => !only || only.includes(p.id),
);
const sha = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
  cwd: sigil,
  encoding: 'utf8',
}).stdout.trim();
const done = new Set(
  existsSync(out)
    ? readFileSync(out, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const r = JSON.parse(line);
          return `${r.id}#${r.run}`;
        })
    : [],
);

function prepare(id, run) {
  const root = join(tmpdir(), 'sigil-dispatch');
  mkdirSync(root, { recursive: true });
  // Long canonical path: an 8.3 short temp name makes the agent's permission check block writes.
  const dir = realpathSync.native(mkdtempSync(join(root, `${id}-${run}-`)));
  cpSync(join(here, '..', 'code-quality', 'fixture-review'), dir, { recursive: true });
  const add = spawnSync(
    process.execPath,
    [
      join(sigil, 'dist-cli', 'cli.js'),
      'add',
      'kind:agent',
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
  return dir;
}

/** The first subagent the model calls, or why there was none. */
function firstDispatch(dir, prompt) {
  return new Promise(resolvePromise => {
    const child = spawn(
      'claude',
      [
        '-p',
        `${prompt} ${SUFFIX}`,
        '--model',
        model,
        '--setting-sources',
        'project',
        '--output-format',
        'stream-json',
        '--verbose',
        '--no-session-persistence',
      ],
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
    const timer = setTimeout(() => finish({ picked: null, reason: 'timeout' }), TIMEOUT_MS);
    let agents = [];
    let toolsBefore = 0;
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
        if (event.type === 'system' && event.subtype === 'init') agents = event.agents ?? [];
        if (event.type === 'assistant') {
          for (const block of event.message?.content ?? []) {
            if (block.type !== 'tool_use') continue;
            if (block.name === 'Agent' || block.name === 'Task') {
              finish({
                picked: block.input?.subagent_type ?? 'general-purpose',
                agents,
                toolsBefore,
              });
              return;
            }
            toolsBefore++;
          }
        }
        if (event.type === 'result') {
          const apiError = event.is_error || event.terminal_reason === 'api_error';
          finish(
            apiError
              ? { error: String(event.result ?? 'api error').slice(0, 160) }
              : { picked: null, reason: 'answered without a subagent', agents, toolsBefore },
          );
        }
      }
    });
    child.on('close', () => finish({ error: 'claude exited without a result' }));
  });
}

for (const { id, expected, prompt } of prompts) {
  for (let run = 1; run <= runs; run++) {
    if (done.has(`${id}#${run}`)) continue;
    const dir = prepare(id, run);
    const result = await firstDispatch(dir, prompt);
    if (result.error) {
      console.log(`${id}#${run}: rejected (${result.error})`);
      continue;
    }
    const record = {
      date: new Date().toISOString().slice(0, 10),
      id,
      run,
      sha,
      model,
      expected,
      ...result,
    };
    appendFileSync(out, `${JSON.stringify(record)}\n`);
    const verdict = result.picked === expected ? 'ok' : `MISS (${result.picked ?? result.reason})`;
    console.log(`${id}#${run}: ${verdict}`);
  }
}

// Tally over every record in --out: correct runs per prompt, and each wrong pick.
const records = existsSync(out)
  ? readFileSync(out, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))
  : [];
for (const { id, expected } of prompts) {
  const mine = records.filter(r => r.id === id);
  const wrong = mine.filter(r => r.picked !== expected).map(r => r.picked ?? r.reason);
  console.log(
    `${id} ${expected}: ${mine.length - wrong.length}/${mine.length}${wrong.length ? `; picked ${wrong.join(', ')}` : ''}`,
  );
}
