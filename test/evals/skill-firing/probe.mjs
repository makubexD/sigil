// Skill-firing probe (README): does an installed skill fire for a request it covers, and stay quiet
// for a neighbouring request it does not?
//
//   node probe.mjs --sigil <sigil checkout> --out runs/<name>.jsonl [--runs 3] [--only F1,Q1]
//                  [--model claude-opus-5-5]
//
// Each run: a fresh project under the OS temp dir (a copy of the prompt's fixture, or an empty
// folder), every TypeScript skill installed from the given checkout (`sigil add kind:skill
// --language typescript`, which also brings the shared skills), then `claude -p "<prompt>"` with
// stream-json output and nothing appended. The process is stopped at the first skill call, after
// MAX_TOOLS other tool calls, or at the result, so a quiet run cannot become a whole task. Records
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
  readdirSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAX_TOOLS = 6;
const TIMEOUT_MS = 300_000;

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = {
  review: join(here, '..', 'code-quality', 'fixture-review'),
  workspace: join(here, 'fixture-workspace'),
  empty: null,
};
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
    'usage: node probe.mjs --sigil <checkout> --out <file.jsonl> [--runs 3] [--only F1,Q1]',
  );
  process.exit(2);
}

const prompts = JSON.parse(readFileSync(join(here, 'prompts.json'), 'utf8')).filter(
  p => !only || only.includes(p.id),
);
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
const done = new Set(readRecords().map(r => `${r.id}#${r.run}`));

/** A fresh project with the catalog's TypeScript skills; returns it and their installed names. */
function prepare(id, run, fixture) {
  const root = join(tmpdir(), 'sigil-firing');
  mkdirSync(root, { recursive: true });
  // Long canonical path: an 8.3 short temp name makes the agent's permission check block writes.
  const dir = realpathSync.native(mkdtempSync(join(root, `${id}-${run}-`)));
  if (FIXTURES[fixture]) cpSync(FIXTURES[fixture], dir, { recursive: true });
  const add = spawnSync(
    process.execPath,
    [
      join(sigil, 'dist-cli', 'cli.js'),
      'add',
      'kind:skill',
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
  return { dir, catalogSkills: readdirSync(join(dir, '.claude', 'skills')) };
}

/** The first skill the model calls, or why there was none. */
function firstSkill(dir, prompt) {
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
    const timer = setTimeout(() => finish({ fired: null, reason: 'timeout' }), TIMEOUT_MS);
    let loaded = [];
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
        if (event.type === 'system' && event.subtype === 'init') loaded = event.skills ?? [];
        if (event.type === 'assistant') {
          for (const block of event.message?.content ?? []) {
            if (block.type !== 'tool_use') continue;
            if (block.name === 'Skill') {
              finish({ fired: String(block.input?.skill ?? ''), loaded, toolsBefore });
              return;
            }
            if (++toolsBefore >= MAX_TOOLS) {
              finish({
                fired: null,
                reason: `no skill in ${MAX_TOOLS} tool calls`,
                loaded,
                toolsBefore,
              });
              return;
            }
          }
        }
        if (event.type === 'result') {
          const apiError = event.is_error || event.terminal_reason === 'api_error';
          finish(
            apiError
              ? { error: String(event.result ?? 'api error').slice(0, 160) }
              : { fired: null, reason: 'finished without a skill', loaded, toolsBefore },
          );
        }
      }
    });
    child.on('close', () => finish({ error: 'claude exited without a result' }));
  });
}

/** ok for a fire prompt: its skill fired first. ok for a quiet one: no catalog skill fired. */
function verdict(record) {
  if (record.expect === 'fire') return record.fired === record.skill;
  return !record.catalogSkills.includes(record.fired);
}

for (const { id, skill, expect, fixture, prompt } of prompts) {
  for (let run = 1; run <= runs; run++) {
    if (done.has(`${id}#${run}`)) continue;
    const { dir, catalogSkills } = prepare(id, run, fixture);
    const result = await firstSkill(dir, prompt);
    if (result.error) {
      console.log(`${id}#${run}: rejected (${result.error})`);
      continue;
    }
    // Every catalog skill must have loaded, or the run measured something else.
    const missing = catalogSkills.filter(name => !result.loaded.includes(name));
    if (missing.length) {
      console.log(`${id}#${run}: rejected (skills not loaded: ${missing.join(', ')})`);
      continue;
    }
    const { loaded, ...rest } = result;
    const record = {
      date: new Date().toISOString().slice(0, 10),
      id,
      run,
      sha,
      model,
      skill,
      expect,
      fixture,
      catalogSkills,
      builtinSkills: loaded.filter(name => !catalogSkills.includes(name)).length,
      ...rest,
    };
    appendFileSync(out, `${JSON.stringify(record)}\n`);
    console.log(
      `${id}#${run}: ${verdict(record) ? 'ok' : 'MISS'} (${result.fired ?? result.reason})`,
    );
  }
}

// Tally over every record in --out: correct runs per prompt, and what fired instead.
const records = readRecords();
for (const { id, skill, expect } of prompts) {
  const mine = records.filter(r => r.id === id);
  const wrong = mine.filter(r => !verdict(r)).map(r => r.fired ?? r.reason);
  const other = mine.filter(r => verdict(r) && r.fired && r.fired !== skill).map(r => r.fired);
  console.log(
    `${id} ${expect} ${skill}: ${mine.length - wrong.length}/${mine.length}` +
      `${wrong.length ? `; got ${wrong.join(', ')}` : ''}${other.length ? `; built-in ${other.join(', ')}` : ''}`,
  );
}
