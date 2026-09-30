/**
 * Tests for src/cli-helpers.ts's file-write helpers — specifically the path-containment guard
 * added for the 2026-08-22 audit's F22 finding (docs/decisions/catalog-benchmark-audit-2026-08-22.md):
 * a FileMap key that escapes outputDir must be refused, as defense-in-depth behind the schema-level
 * id/name regex guards.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { writeFilesSync, partitionFiles } from '../dist-cli/cli-helpers';
import { withTempDir } from './helpers/temp-dir';

describe('writeFilesSync — path containment (F22)', () => {
  it('writes a well-formed relative path normally', () => {
    withTempDir(dir => {
      writeFilesSync({ 'agents/foo.md': 'hello' }, dir);

      assert.equal(fs.readFileSync(path.join(dir, 'agents', 'foo.md'), 'utf-8'), 'hello');
    });
  });

  it('refuses a FileMap key that escapes outputDir via "../"', () => {
    withTempDir(dir => {
      assert.throws(
        () => writeFilesSync({ '../../etc/evil.md': 'pwned' }, dir),
        /Refusing to write outside output directory/,
      );
    });
  });

  it('refuses an absolute path used as a FileMap key', () => {
    withTempDir(dir => {
      const outside = path.join(path.dirname(dir), 'outside.md');
      assert.throws(
        () => writeFilesSync({ [outside]: 'pwned' }, dir),
        /Refusing to write outside output directory/,
      );
    });
  });
});

describe('partitionFiles — path containment (F22)', () => {
  it('refuses a FileMap key that escapes outputDir', () => {
    withTempDir(dir => {
      assert.throws(
        () => partitionFiles({ '../escaped.md': 'x' }, dir),
        /Refusing to write outside output directory/,
      );
    });
  });
});
