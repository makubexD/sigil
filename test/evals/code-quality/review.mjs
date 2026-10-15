// Runs the R1 reviewer scenario (scenarios.md, key.md) for one arm, headless.
//
//   node review.mjs --arm <name> --sigil <sigil checkout> --out runs/r1-<name> [--runs 3]
//                   [--model claude-opus-5-5]
//
// Each run: a fresh copy of fixture-review/ under the OS temp dir, the TypeScript rules plus the
// `typescript/ts-code-reviewer` agent installed from the given checkout, then `claude -p` asking for
// that agent's review. The final reply is saved as <out>/R1-<run>.md. Grading is by hand against
// key.md (R1): count the seeded defects named with their location, and any invented finding.
/* global process, console */
import { cpSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
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
const arm = flag('arm');
const sigil = flag('sigil') && resolve(flag('sigil'));
const out = flag('out') && resolve(flag('out'));
const runs = Number(flag('runs', 3));
const model = flag('model', 'claude-opus-5-5');
if (!arm || !sigil || !out) {
  console.error('usage: node review.mjs --arm <name> --sigil <checkout> --out <dir> [--runs 3]');
  process.exit(2);
}

const PROMPT =
  'Use the ts-code-reviewer agent to review src/orders.ts in this project for correctness, ' +
  "design and performance. Report the agent's findings; do not edit files.";

function sigilAdd(dir, selector, extra = []) {
  const add = spawnSync(
    process.execPath,
    [
      join(sigil, 'dist-cli', 'cli.js'),
      'add',
      selector,
      ...extra,
      '--target',
      'claude',
      '--yes',
      '--project-dir',
      dir,
    ],
    { encoding: 'utf8' },
  );
  if (add.status !== 0) throw new Error(`sigil add ${selector} failed: ${add.stderr}`);
}

mkdirSync(out, { recursive: true });
for (let run = 1; run <= runs; run++) {
  const root = join(tmpdir(), 'sigil-cq-review');
  mkdirSync(root, { recursive: true });
  const dir = realpathSync.native(mkdtempSync(join(root, `${arm}-${run}-`)));
  cpSync(join(here, 'fixture-review'), dir, { recursive: true });
  sigilAdd(dir, 'kind:rule', ['--language', 'typescript']);
  sigilAdd(dir, 'typescript/ts-code-reviewer');
  const result = spawnSync(
    'claude',
    [
      '-p',
      PROMPT,
      '--model',
      model,
      '--setting-sources',
      'project',
      '--output-format',
      'json',
      '--no-session-persistence',
    ],
    { cwd: dir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  let reply;
  try {
    reply = JSON.parse(result.stdout);
  } catch {
    console.error(`${arm} R1#${run}: unparseable output, not recorded`);
    continue;
  }
  if (reply.is_error || reply.terminal_reason === 'api_error' || !reply.num_turns) {
    console.error(
      `${arm} R1#${run}: invalid run (${reply.terminal_reason ?? 'error'}), not recorded`,
    );
    continue;
  }
  writeFileSync(join(out, `R1-${run}.md`), `${reply.result}\n`);
  console.log(
    `${arm} R1#${run}: saved (${reply.num_turns} turns, $${reply.total_cost_usd?.toFixed(2)})`,
  );
}
