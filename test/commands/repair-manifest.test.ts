/**
 * A damaged install record would otherwise block every action. Repair sets it aside (never deletes
 * it) so a fresh one can start, and asks first.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runRepair, setAsideManifest } from '../../dist-cli/commands/repair-manifest';
import { detectProjectContext } from '../../dist-cli/project-context';
import { mockClack } from '../helpers/clack-mock';
import { withTempDir, withTempDirAsync } from '../helpers/temp-dir';

const damage = (dir: string): string => {
  const file = path.join(dir, '.sigil', 'manifest.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ not json');
  return file;
};

describe('setAsideManifest', () => {
  it('should rename the damaged file next to the original and keep its content', () => {
    withTempDir(dir => {
      const original = damage(dir);
      const saved = setAsideManifest(dir, new Date('2026-01-02T03:04:05.678Z'));
      assert.equal(fs.existsSync(original), false);
      assert.match(saved ?? '', /manifest\.damaged-2026-01-02T03-04-05-678Z\.json$/);
      assert.equal(fs.readFileSync(saved!, 'utf-8'), '{ not json');
    });
  });

  it('should return null when there is no record', () => {
    withTempDir(dir => assert.equal(setAsideManifest(dir), null));
  });
});

describe('runRepair', () => {
  it('should clear the error once the user agrees', async () => {
    await withTempDirAsync(async dir => {
      damage(dir);
      assert.ok(detectProjectContext(dir).manifestError);
      const restore = mockClack([true]);
      try {
        await runRepair(dir);
      } finally {
        restore();
      }
      assert.equal(detectProjectContext(dir).manifestError, undefined);
    });
  });

  it('should change nothing when the user says no or cancels', async () => {
    for (const answer of [false, Symbol('cancel')]) {
      await withTempDirAsync(async dir => {
        const original = damage(dir);
        const restore = mockClack([answer]);
        try {
          await runRepair(dir);
        } finally {
          restore();
        }
        assert.equal(fs.existsSync(original), true);
      });
    }
  });
});
