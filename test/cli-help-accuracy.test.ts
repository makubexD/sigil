/**
 * `sigil <cmd> --help` is the source of docs/reference/cli-flags.md, so it must stay accurate and
 * machine-independent: no hand-listed kinds that drift from KIND_REGISTRY, no absolute paths from
 * the machine that ran the help, and no overclaims about what a command rewrites.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ALL_KINDS } from '../dist-cli/kinds';
import { cliHelp, mapParallel } from './helpers/cli-help';

const DOC = path.resolve(__dirname, '../docs/reference/cli-flags.md');
const PKG_ROOT = path.resolve(__dirname, '..');

const WIDE = 400;

function help(...args: string[]): Promise<string> {
  return helpFrom(PKG_ROOT, ...args);
}

function helpFrom(cwd: string, ...args: string[]): Promise<string> {
  return cliHelp([...args, '--help'], { cwd, columns: WIDE });
}

describe('sigil --help accuracy', () => {
  it('should list every artifact kind in `list --kind`', async () => {
    const text = await help('list');
    const missing = ALL_KINDS.filter(kind => !text.includes(kind));
    assert.deepEqual(missing, [], `list --kind help omits: ${missing.join(', ')}`);
  });

  it('should not print the machine-specific package root as a default', async () => {
    const commands = ['build', 'list', 'add', 'status'];
    const texts = await mapParallel(commands, command => help(command));
    commands.forEach((command, i) => {
      const text = texts[i] as string;
      // Commander prints defaults via JSON.stringify, which doubles Windows backslashes.
      assert.ok(
        !text.includes(PKG_ROOT) && !text.includes(JSON.stringify(PKG_ROOT).slice(1, -1)),
        `sigil ${command} --help leaks the absolute package root ${PKG_ROOT}`,
      );
    });
  });

  it('should not leak the package root from any command, run outside the package', async () => {
    const top = await help();
    const commands = [...top.matchAll(/^ {2}([a-z][a-z0-9-]*)(?:\|[a-z0-9|-]+)?(?=\s)/gm)]
      .map(match => match[1])
      .filter((name): name is string => name !== undefined && name !== 'help');
    assert.ok(commands.length >= 20, `expected the full command list, got ${commands.length}`);
    const escaped = JSON.stringify(PKG_ROOT).slice(1, -1);
    const texts = await mapParallel(commands, name => helpFrom(os.tmpdir(), name));
    const leaks = commands.filter((_, i) => {
      const text = texts[i] as string;
      return text.includes(PKG_ROOT) || text.includes(escaped);
    });
    assert.deepEqual(leaks, [], `--help leaks the absolute package root for: ${leaks.join(', ')}`);
  });

  it('should describe the --project-dir default as the current directory', async () => {
    assert.match(await help('add'), /--project-dir <dir>[^\n]*\(default: <cwd>\)/);
  });

  it('should keep package defaults labelled <package> when run from inside the package', async () => {
    const text = await helpFrom(path.join(PKG_ROOT, 'catalog'), 'list');
    assert.match(text, /--catalog-dir <dir>[^\n]*\(default: <package>\/catalog\)/);
  });

  it('should only claim that move rewrites extends/uses referrers', async () => {
    const text = await help('move');
    assert.doesNotMatch(text, /rewrite all referrers/i);
    assert.match(text, /extends|uses/);
  });

  it('should keep absolute machine paths out of docs/reference/cli-flags.md', () => {
    const doc = fs.readFileSync(DOC, 'utf8');
    const absolute = doc.match(/(?:[A-Za-z]:\\\\?[\w.\\-]+|\/(?:home|Users)\/[\w./-]+)/g) ?? [];
    assert.deepEqual(absolute, [], `cli-flags.md contains machine paths: ${absolute.join(', ')}`);
  });
});
