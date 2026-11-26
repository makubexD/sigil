// Scripted checks for the baseline gate (README, Grading). A check looks at the project a run left
// behind and at the run's final answer, and passes or fails: no model reads anything here.
/* global process */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', '.github', '.sigil']);
const COMMAND_TIMEOUT_MS = 120_000;

/** Every file the run could have written, relative to the project, catalog folders left out. */
export function projectFiles(dir, base = dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return SKIP_DIRS.has(name) ? [] : projectFiles(full, base);
    return [relative(base, full).replaceAll('\\', '/')];
  });
}

const matching = (dir, glob) => {
  const pattern = new RegExp(
    `^${glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replaceAll('**/', '(?:.*/)?')
      .replaceAll('*', '[^/]*')}$`,
  );
  return projectFiles(dir).filter(file => pattern.test(file));
};

const KINDS = {
  /** A file matching `glob` exists. */
  'file-exists': ({ glob }, { dir }) => matching(dir, glob).length > 0,
  /** Some file matching `glob` matches `pattern`. */
  'file-matches': ({ glob, pattern, flags = '' }, { dir }) =>
    matching(dir, glob).some(file =>
      new RegExp(pattern, flags).test(readFileSync(join(dir, file), 'utf8')),
    ),
  /** No file matching `glob` matches `pattern`. */
  'file-lacks': ({ glob, pattern, flags = '' }, { dir }) =>
    !matching(dir, glob).some(file =>
      new RegExp(pattern, flags).test(readFileSync(join(dir, file), 'utf8')),
    ),
  /** The run's final answer matches `pattern`. */
  'answer-matches': ({ pattern, flags = 'i' }, { answer }) =>
    new RegExp(pattern, flags).test(answer),
  /** The run's final answer does not match `pattern`. */
  'answer-lacks': ({ pattern, flags = 'i' }, { answer }) =>
    !new RegExp(pattern, flags).test(answer),
  /** `command` exits 0 in the project (hidden tests, a type check). */
  command: ({ command, args = [] }, { dir }) =>
    spawnSync(command === 'node' ? process.execPath : command, args, {
      cwd: dir,
      encoding: 'utf8',
      timeout: COMMAND_TIMEOUT_MS,
    }).status === 0,
};

export const CHECK_KINDS = Object.keys(KINDS);

/** Runs a request's checks over one finished run: [{ id, pass }]. */
export function runChecks(checks, run) {
  if (!existsSync(run.dir)) throw new Error(`no project at ${run.dir}`);
  return checks.map(check => {
    const kind = KINDS[check.kind];
    if (!kind) throw new Error(`check ${check.id}: unknown kind ${check.kind}`);
    return { id: check.id, pass: Boolean(kind(check, run)) };
  });
}

/** Why a request file can't be run, one line per problem; empty when it can. */
export function requestProblems(spec) {
  const problems = [];
  if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(spec.artifact ?? ''))
    problems.push('artifact: want <ns>/<id>');
  if (!['skill', 'agent', 'rule'].includes(spec.kind)) problems.push('kind: skill, agent or rule');
  const requests = spec.requests ?? [];
  const working = requests.filter(request => !request.quiet);
  if (working.length < 5) problems.push(`requests: ${working.length} working requests, want 5`);
  if (requests.filter(request => request.quiet).length !== 1)
    problems.push('requests: want 1 quiet');
  const name = (spec.artifact ?? '').split('/').pop();
  for (const request of requests) {
    const at = `request ${request.id}`;
    if (!request.prompt) problems.push(`${at}: no prompt`);
    else if (name && request.prompt.includes(name))
      problems.push(`${at}: the prompt names ${name}`);
    if (!(request.checks ?? []).length) problems.push(`${at}: no checks`);
    for (const check of request.checks ?? []) {
      if (!KINDS[check.kind]) problems.push(`${at}, check ${check.id}: unknown kind ${check.kind}`);
    }
  }
  return problems;
}
