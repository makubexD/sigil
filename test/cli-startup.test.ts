/**
 * `sigil --version` and `sigil <command> --help` must not load any command module. `src/cli.ts` wraps
 * each command in `lazy()`; one eager `import { runX } from './commands/x'` puts that module's whole
 * import tree back on every start (about 120 ms for all of them, and the test suite starts the CLI
 * more than a hundred times).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CLI = path.resolve(__dirname, '../dist-cli/cli.js');
const COMMANDS_DIR = path.resolve(__dirname, '../dist-cli/commands');

/** Runs the CLI in-process under a wrapper that reports which command modules it loaded, at exit. */
async function loadedCommandModules(args: readonly string[]): Promise<string[]> {
  const script = `
    process.argv = [process.argv[0], ${JSON.stringify(CLI)}, ...${JSON.stringify(args)}];
    process.on('exit', () => {
      const dir = ${JSON.stringify(COMMANDS_DIR)};
      const loaded = Object.keys(require.cache).filter(file => file.startsWith(dir));
      process.stderr.write('LOADED ' + JSON.stringify(loaded));
    });
    require(${JSON.stringify(CLI)});
  `;
  const { stderr } = await execFileAsync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const marker = /LOADED (\[.*\])/.exec(stderr);
  assert.ok(marker, `the wrapper reported nothing: ${stderr}`);
  return JSON.parse(marker[1] as string) as string[];
}

describe('sigil start-up', () => {
  for (const args of [['--version'], ['sync', '--help'], ['add', '--help']]) {
    it(`should load no command module for \`sigil ${args.join(' ')}\``, async () => {
      assert.deepEqual(await loadedCommandModules(args), []);
    });
  }
});
