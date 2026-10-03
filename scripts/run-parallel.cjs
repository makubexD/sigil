/**
 * Runs independent commands at the same time and fails if any of them fails.
 *
 * CI used to run `lint` and `format:check` one after the other (7 s each, both only read files) on a
 * 4-vCPU runner. Each command's output is held until it finishes and printed under its own heading, so
 * the logs of two tools never interleave. A failing command does not stop the others: every check still
 * runs to completion and every failure is reported.
 *
 * Run: node scripts/run-parallel.cjs "npm run lint" "npm run format:check"
 */
const { spawn } = require('child_process');

/** Runs one shell command; resolves with its exit code and everything it printed. */
function run(command) {
  return new Promise(resolve => {
    const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.on('data', chunk => chunks.push(chunk));
    child.on('error', error => resolve({ command, code: 1, output: String(error) }));
    child.on('close', code => {
      resolve({ command, code: code ?? 1, output: Buffer.concat(chunks).toString('utf8') });
    });
  });
}

async function main(commands) {
  if (commands.length === 0) {
    console.error('Usage: node scripts/run-parallel.cjs "<command>" ["<command>" ...]');
    return 1;
  }
  const results = await Promise.all(commands.map(run));
  for (const { command, code, output } of results) {
    console.log(`::group::${command} (${code === 0 ? 'ok' : `exit ${code}`})`);
    console.log(output.trimEnd());
    console.log('::endgroup::');
  }
  const failed = results.filter(result => result.code !== 0);
  for (const { command, code } of failed) console.error(`FAILED (exit ${code}): ${command}`);
  return failed.length === 0 ? 0 : 1;
}

main(process.argv.slice(2)).then(code => process.exit(code));
