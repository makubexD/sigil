// Runs a hidden Python grader in the project a run left behind (README, Grading).
//
//   node py.mjs <grader.py> <case>     (cwd: the project)
//
// The grader sits beside this file, outside the project, so a run never sees it. Exit code is the
// grader's. Needs `python` on PATH.
/* global process */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [grader, name] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const result = spawnSync('python', [join(here, grader), name], {
  cwd: process.cwd(),
  stdio: 'inherit',
  timeout: 60_000,
});
process.exit(result.status ?? 1);
