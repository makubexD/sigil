/**
 * Root `sigil` behaviour without a terminal: help must reach stdout with exit 0 (a bare `sigil`
 * that prints to stderr and exits 1 looks like a failure), and a mistyped command must still fail.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { stripAnsi } from './helpers/ansi';

const CLI = path.resolve(__dirname, '../dist-cli/cli.js');

function run(...args: string[]) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    input: '',
    env: { ...process.env, COLUMNS: '120', FORCE_COLOR: '0' },
    windowsHide: true,
  });
  return {
    status: result.status,
    stdout: stripAnsi(result.stdout),
    stderr: stripAnsi(result.stderr),
  };
}

describe('sigil root command (no terminal)', () => {
  it('should print help on stdout and exit 0 when run with no arguments', () => {
    const result = run();
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: sigil/);
    assert.equal(result.stderr, '');
  });

  it('should print help on stdout and exit 0 for `help` and `--help`', () => {
    for (const args of [['help'], ['--help']]) {
      const result = run(...args);
      assert.equal(result.status, 0, args.join(' '));
      assert.match(result.stdout, /Usage: sigil/, args.join(' '));
      assert.equal(result.stderr, '', args.join(' '));
    }
  });

  it('should print the version and exit 0', () => {
    const result = run('--version');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^\d+\.\d+\.\d+/);
  });

  it('should reject a mistyped command with exit 1 and a suggestion', () => {
    const result = run('instal');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unknown command 'instal'/);
    assert.match(result.stderr, /Did you mean/);
  });

  it('should still reject an unknown option', () => {
    const result = run('--nope');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unknown option/);
  });
});
