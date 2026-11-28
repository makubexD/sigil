// Grades a review a run gave as its answer (README, Grading).
//
//   node review.mjs <set> <case>     (cwd: the project; the answer on standard input)
//
// A case is one defect planted in a fixture. It passes when the answer names the defect, in any of
// the words its pattern allows, and within a few hundred characters of that says where it is: a
// line number on or beside the planted lines, or the name of the function they are in. The planted
// lines are found by their text in the fixture as it is kept here, not in the run's copy, so a run
// that edited the file is graded against the lines it was handed. The cases of a set are in
// review/<set>.mjs.
/* global process, console */
import { readFileSync } from 'node:fs';
import { located } from './review/locate.mjs';

const [set, name] = process.argv.slice(2);
const { CASES } = await import(`./review/${set}.mjs`);
if (!Object.hasOwn(CASES, name)) {
  console.log(`${set}: no case ${name}`);
  process.exit(2);
}
const found = located(readFileSync(0, 'utf8'), CASES[name]);
console.log(`${name}: ${found.ok ? 'ok' : found.why}`);
process.exit(found.ok ? 0 : 1);
