// Runs a hidden Angular grader against the project a run left behind (README, Grading).
//
//   node angular.mjs <set> <case>     (cwd: the project)
//   node angular.mjs --install        installs the grader's packages (web/angular.deps.json) and stops
//
// The project is imported as a bundler would (web/hooks.mjs) into a jsdom page with a fake API
// server (web/dom.mjs), and compiled in the page by Angular's own compiler. The cases of a set are in
// angular/<set>.mjs.
/* global process, console, setTimeout, clearTimeout */
import { depsRoot } from './web/env.mjs';
import { installHooks } from './web/hooks.mjs';

const [set, name] = process.argv.slice(2);
const deps = depsRoot('angular');
if (set === '--install') process.exit(0);
installHooks({ project: process.cwd(), deps });

const { CASES } = await import(`./angular/${set}.mjs`);
if (!Object.hasOwn(CASES, name)) {
  console.log(`${set}: no case ${name}`);
  process.exit(2);
}
// A case that hangs fails: the stage must not stall on it.
const watchdog = setTimeout(() => {
  process.stdout.write(`${name}: timed out\n`);
  process.exit(1);
}, 30_000);
try {
  await CASES[name]();
  clearTimeout(watchdog);
  process.exit(0);
} catch (error) {
  process.stdout.write(`${name}: ${error?.message ?? error}\n`);
  process.exit(1);
}
