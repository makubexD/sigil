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
    env: { ...process.env, COLUMNS: '80', FORCE_COLOR: '0' },
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

  it('should group commands under task headings', () => {
    const { stdout } = run('--help');
    for (const heading of [
      'Start here:',
      'Browse the catalog:',
      'Author the catalog:',
      'Build & release:',
    ]) {
      assert.ok(stdout.includes(`\n${heading}\n`), `root help is missing "${heading}"`);
    }
  });

  it('should leave no command outside a group except `help`', () => {
    const { stdout } = run('--help');
    const ungrouped = /\nCommands:\n((?: {2}.*\n)+)/.exec(stdout)?.[1] ?? '';
    const names = ungrouped
      .split('\n')
      .filter(Boolean)
      .map(line => line.trim().split(/\s+/)[0]);
    assert.deepEqual(names, ['help'], 'add the new command to HELP_LAYOUT in src/cli.ts');
  });

  it('should list "Start here" before the other groups', () => {
    const { stdout } = run('--help');
    assert.ok(stdout.indexOf('Start here:') < stdout.indexOf('Browse the catalog:'));
    assert.ok(stdout.indexOf('Browse the catalog:') < stdout.indexOf('Author the catalog:'));
    assert.ok(stdout.indexOf('Author the catalog:') < stdout.indexOf('Build & release:'));
  });

  it('should show each command on one line in the root help', () => {
    // 80 columns is the narrowest terminal we care about.
    const { stdout } = run('--help');
    const lines = stdout.split('\n');
    const wrapped = lines.filter(line => /^ {20,}\S/.test(line));
    assert.deepEqual(wrapped, [], 'a command description wraps; give it a short .summary()');
    const tooWide = lines.filter(line => line.length > 80);
    assert.deepEqual(tooWide, []);
  });

  it('should end the root help with how to start, get help and run from a clone', () => {
    const { stdout } = run('--help');
    assert.match(stdout, /Run `sigil` with no command/);
    assert.match(stdout, /sigil <command> --help/);
    assert.match(stdout, /npm run sigil -- /);
  });

  it('should keep the full description on `<command> --help`', () => {
    assert.match(
      run('sync', '--help').stdout,
      /PLUS\s+conformance\s+against\s+the\s+current\s+provider/,
    );
  });

  it('should still reject an unknown option', () => {
    const result = run('--nope');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unknown option/);
  });
});
