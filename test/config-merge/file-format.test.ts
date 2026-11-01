/**
 * Tests for src/config-merge/file-format.ts — the per-path config-file format seam.
 *
 * Today the only format is JSON: `parseConfig` is `JSON.parse` and `renderConfig` is the
 * order-preserving `serialize()` writer. These tests pin that JSON behavior, plus the seam's
 * contract that no command module calls `serialize(` directly anymore — every disk write must
 * route through `renderConfig` so a future non-JSON format plugs in in exactly one place.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseConfig, renderConfig } from '../../dist-cli/config-merge/file-format';
import { serialize } from '../../dist-cli/config-merge';

/** Absolute path to src/commands/ (source, not compiled), for the no-direct-serialize check. */
const SRC_COMMANDS = path.resolve(__dirname, '../../src/commands');

/** Recursively lists every .ts file under `dir`. */
function tsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? tsFiles(full) : entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('config-merge file-format', () => {
  it('parseConfig parses JSON by path', () => {
    assert.deepEqual(parseConfig('a.json', '{"a":1}'), { a: 1 });
  });

  it('parseConfig throws on invalid content', () => {
    assert.throws(() => parseConfig('a.json', 'nope'));
  });

  it('renderConfig equals serialize and keeps key order', () => {
    const out = renderConfig('a.json', { b: 1, a: 2 });
    assert.equal(out, serialize({ b: 1, a: 2 }));
    assert.deepEqual(Object.keys(JSON.parse(out)), ['b', 'a']);
  });

  it('no command module calls serialize( directly — disk writes go through renderConfig', () => {
    const offenders = tsFiles(SRC_COMMANDS)
      .filter(file => fs.readFileSync(file, 'utf8').includes('serialize('))
      .map(file => path.relative(SRC_COMMANDS, file));
    assert.deepEqual(offenders, []);
  });
});
