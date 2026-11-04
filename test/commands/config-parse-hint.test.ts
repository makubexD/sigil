/**
 * The parse-failure hint shared by `add` and `update`: a hand-commented `.json` file names
 * JSON's no-comments rule and suggests `.jsonc`, while a TOML file keeps its plain message.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { configParseProblem } from '../../dist-cli/config-merge';
import { withTempDir } from '../helpers/temp-dir';

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const MCP = 'shared/filesystem';
const CONFIG = path.join('.opencode', 'opencode.json');

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the built CLI in `project`, with its HOME and XDG_CONFIG_HOME kept in the temp dir. */
function sigil(project: string, args: string[]): CliResult {
  const home = path.join(project, 'home');
  fs.mkdirSync(home, { recursive: true });
  const done = spawnSync(process.execPath, [CLI, ...args, '--project-dir', project], {
    cwd: project,
    encoding: 'utf8',
    input: '',
    windowsHide: true,
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') },
  });
  return { status: done.status, stdout: done.stdout ?? '', stderr: done.stderr ?? '' };
}

/** Writes `text` as the project's OpenCode config and returns its path. */
function seedConfig(project: string, text: string): string {
  const fullPath = path.join(project, CONFIG);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, text);
  return fullPath;
}

describe('configParseProblem', () => {
  it('names the comment rule and the .jsonc escape for a .json file', () => {
    assert.match(configParseProblem('a/opencode.json'), /comments or trailing commas/);
  });

  it('keeps the plain message for a .toml file', () => {
    assert.equal(configParseProblem('a/config.toml'), 'is not valid TOML.');
  });
});

describe('add and update parse hint', () => {
  it('add fails on a hand-commented .json file and leaves it byte-identical', () => {
    withTempDir(project => {
      const original = '{\n  // note\n  "mcp": {}\n}\n';
      const fullPath = seedConfig(project, original);

      const result = sigil(project, [
        'add',
        MCP,
        '--target',
        'opencode',
        '--scope',
        'project',
        '--yes',
      ]);

      assert.notEqual(result.status, 0, result.stderr);
      assert.match(result.stderr, /not valid JSON/);
      assert.match(result.stderr, /\.jsonc/);
      assert.deepEqual(fs.readFileSync(fullPath), Buffer.from(original));
    });
  });

  it('update skips a file that gained a comment after install and leaves it byte-identical', () => {
    withTempDir(project => {
      const added = sigil(project, [
        'add',
        MCP,
        '--target',
        'opencode',
        '--scope',
        'project',
        '--yes',
      ]);
      assert.equal(added.status, 0, added.stderr);

      const fullPath = path.join(project, CONFIG);
      const commented = '// note\n' + fs.readFileSync(fullPath, 'utf8');
      fs.writeFileSync(fullPath, commented);

      const result = sigil(project, ['update', MCP, '--target', 'opencode', '--yes']);

      assert.match(result.stderr, /\.jsonc/);
      assert.match(result.stderr, /Skipped\./);
      assert.deepEqual(fs.readFileSync(fullPath), Buffer.from(commented));
    });
  });
});
