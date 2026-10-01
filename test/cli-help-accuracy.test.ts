/**
 * `sigil <cmd> --help` is the source of docs/reference/cli-flags.md, so it must stay accurate and
 * machine-independent: no hand-listed kinds that drift from KIND_REGISTRY, no absolute paths from
 * the machine that ran the help, and no overclaims about what a command rewrites.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_KINDS } from '../dist-cli/kinds';
import { stripAnsi } from './helpers/ansi';

const CLI = path.resolve(__dirname, '../dist-cli/cli.js');
const DOC = path.resolve(__dirname, '../docs/reference/cli-flags.md');
const PKG_ROOT = path.resolve(__dirname, '..');

function help(...args: string[]): string {
  return stripAnsi(
    execFileSync(process.execPath, [CLI, ...args, '--help'], {
      encoding: 'utf8',
      env: { ...process.env, COLUMNS: '400', FORCE_COLOR: '0' },
      windowsHide: true,
    }),
  );
}

describe('sigil --help accuracy', () => {
  it('should list every artifact kind in `list --kind`', () => {
    const text = help('list');
    const missing = ALL_KINDS.filter(kind => !text.includes(kind));
    assert.deepEqual(missing, [], `list --kind help omits: ${missing.join(', ')}`);
  });

  it('should not print the machine-specific package root as a default', () => {
    for (const command of ['build', 'list', 'add', 'status']) {
      const text = help(command);
      // Commander prints defaults via JSON.stringify, which doubles Windows backslashes.
      assert.ok(
        !text.includes(PKG_ROOT) && !text.includes(JSON.stringify(PKG_ROOT).slice(1, -1)),
        `sigil ${command} --help leaks the absolute package root ${PKG_ROOT}`,
      );
    }
  });

  it('should describe the --project-dir default as the current directory', () => {
    assert.match(help('add'), /--project-dir <dir>[^\n]*\(default: <cwd>\)/);
  });

  it('should only claim that move rewrites extends/uses referrers', () => {
    assert.doesNotMatch(help('move'), /rewrite all referrers/i);
    assert.match(help('move'), /extends|uses/);
  });

  it('should keep absolute machine paths out of docs/reference/cli-flags.md', () => {
    const doc = fs.readFileSync(DOC, 'utf8');
    const absolute = doc.match(/(?:[A-Za-z]:\\\\?[\w.\\-]+|\/(?:home|Users)\/[\w./-]+)/g) ?? [];
    assert.deepEqual(absolute, [], `cli-flags.md contains machine paths: ${absolute.join(', ')}`);
  });
});
