// Runs a hidden command-line grader against the project a run left behind (README, Grading).
//
//   node cli.mjs <set> <case>     (cwd: the project)
//
// The project's own `bin/depot.mjs` is started as a user or a script would start it, on pipes or on
// what looks to it like a terminal (cli/kit.mjs). The cases of a set are in cli/<set>.mjs.
/* global process, console */
const [set, name] = process.argv.slice(2);

const { CASES } = await import(`./cli/${set}.mjs`);
if (!Object.hasOwn(CASES, name)) {
  console.log(`${set}: no case ${name}`);
  process.exit(2);
}
try {
  await CASES[name]();
  console.log(`${name}: ok`);
  process.exit(0);
} catch (error) {
  console.log(`${name}: ${error.message.split('\n')[0]}`);
  process.exit(1);
}
