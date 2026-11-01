/**
 * `add` warns when a hook's bare `command` is not on this machine's PATH. A hook that cannot
 * start fails open, so the install still succeeds — it only says so (plan: cursor Phase C, step 7).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { commandOnPath } from '../../dist-cli/commands/add/hook-path-warning';
import { withTempDir } from '../helpers/temp-dir';

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const HOOK = 'shared/protect-config';
const HOME_VAR = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';

interface CliResult {
  status: number | null;
  output: string;
}

/** Runs `add` for the hook in a temp project, with `PATH` and the home directory overridden. */
function addHook(project: string, home: string, pathValue: string): CliResult {
  const done = spawnSync(
    process.execPath,
    [
      CLI,
      'add',
      HOOK,
      '--target',
      'cursor',
      '--scope',
      'project',
      '--yes',
      '--project-dir',
      project,
    ],
    {
      cwd: project,
      encoding: 'utf8',
      input: '',
      windowsHide: true,
      env: { ...process.env, [HOME_VAR]: home, PATH: pathValue },
    },
  );
  return { status: done.status, output: `${done.stdout ?? ''}${done.stderr ?? ''}` };
}

/** A project dir, a home dir and an empty directory to use as the whole PATH. */
function makeDirs(work: string): { project: string; home: string; emptyBin: string } {
  const project = path.join(work, 'project');
  const home = path.join(work, 'home');
  const emptyBin = path.join(work, 'empty-bin');
  for (const dir of [project, home, emptyBin]) fs.mkdirSync(dir);
  return { project, home, emptyBin };
}

describe('add hook PATH warning', () => {
  it('warns when the hook command is not on PATH, and still writes the file', () => {
    withTempDir(work => {
      const { project, home, emptyBin } = makeDirs(work);

      const result = addHook(project, home, emptyBin);

      assert.equal(result.status, 0, result.output);
      assert.match(
        result.output,
        /hook shared\/protect-config: 'node' is not on PATH here, and a hook that can't start lets every call through/,
      );
      assert.ok(
        fs.existsSync(path.join(project, '.cursor', 'hooks.json')),
        'the hook file was written',
      );
    });
  });

  it('does not warn when the hook command is on the real PATH', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);

      const result = addHook(project, home, process.env.PATH ?? '');

      assert.equal(result.status, 0, result.output);
      assert.doesNotMatch(result.output, /is not on PATH/);
    });
  });
});

describe('commandOnPath', () => {
  it('finds node on this machine’s real PATH', () => {
    assert.equal(commandOnPath('node'), true);
  });

  it('finds nothing in a PATH holding only an empty directory', () => {
    withTempDir(dir => {
      assert.equal(commandOnPath('node', { PATH: dir }), false);
    });
  });

  it('treats an empty PATH as having no directories', () => {
    assert.equal(commandOnPath('x', { PATH: '' }), false);
  });
});
