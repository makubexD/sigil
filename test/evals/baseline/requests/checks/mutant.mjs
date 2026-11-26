// Passes when the project's own tests catch a planted bug (README, Grading).
//
//   node mutant.mjs <file> <find> <replace>     (cwd: the project a run left behind)
//
// The tests must pass on the source as the run left it; then <find>, which must occur exactly once
// in <file>, is replaced and the tests must fail. The source is restored either way.
// Exit 0: the bug was caught. 1: it survived, or the tests fail without it. 2: <find> is not there
// exactly once (the run changed the source).
/* global process */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [file, find, replace] = process.argv.slice(2);
const testsPass = () =>
  spawnSync(process.execPath, ['--test'], { stdio: 'ignore', timeout: 60_000 }).status === 0;

const source = readFileSync(file, 'utf8');
if (source.split(find).length !== 2) process.exit(2);
if (!testsPass()) process.exit(1);
let caught;
try {
  writeFileSync(file, source.replace(find, replace));
  caught = !testsPass();
} finally {
  writeFileSync(file, source);
}
process.exit(caught ? 0 : 1);
