// Runs a hidden React grader against the project a run left behind (README, Grading).
//
//   node react.mjs <set> <case>     (cwd: the project)
//   node react.mjs --install        installs the grader's packages (web/react.deps.json) and stops
//
// The project is imported as a bundler would (web/hooks.mjs) into a jsdom page with a fake API
// server (web/dom.mjs), against real React. The cases of a set are in react/<set>.mjs.
/* global process, console, setTimeout, clearTimeout */
import { depsRoot } from './web/env.mjs';
import { installHooks } from './web/hooks.mjs';

const [set, name] = process.argv.slice(2);
const deps = depsRoot('react');
if (set === '--install') process.exit(0);
installHooks({ project: process.cwd(), deps });

const { CASES } = await import(`./react/${set}.mjs`);
if (!Object.hasOwn(CASES, name)) {
  console.log(`${set}: no case ${name}`);
  process.exit(2);
}
// A case that hangs fails: the stage must not stall on it.
const watchdog = setTimeout(() => {
  process.stdout.write(`${name}: timed out\n`);
  process.exit(1);
}, 20_000);
try {
  await CASES[name]();
  clearTimeout(watchdog);
  process.exit(0);
} catch (error) {
  process.stdout.write(`${name}: ${error?.message ?? error}\n`);
  process.exit(1);
}
