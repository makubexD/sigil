/**
 * `sigil move` keeps catalog/standard.yaml in step: a family lists its members by id, so the moved
 * artifact's id is renamed there too, as text (comments survive), and only as a whole id.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  moveStandardMember,
  renameStandardMember,
} from '../../dist-cli/authoring/move/standard-member';
import { withTempDirAsync } from '../helpers/temp-dir';

const STANDARD = [
  '# families',
  'families:',
  '  - id: release',
  '    kind: skill',
  '    members:',
  '      - typescript/ts-release',
  '      - typescript/ts-release-notes',
  '    members2: [typescript/ts-release]',
  '',
].join('\n');

describe('move and standard.yaml', () => {
  it('should rename a whole member id, never a longer id that starts the same', () => {
    const next = renameStandardMember(STANDARD, 'typescript/ts-release', 'typescript/ts-ship');
    assert.match(next, /- typescript\/ts-ship\n/);
    assert.match(next, /\[typescript\/ts-ship\]/);
    assert.match(next, /- typescript\/ts-release-notes\n/);
    assert.match(next, /^# families/);
  });

  it('should rewrite the file and roll it back', async () => {
    await withTempDirAsync(async dir => {
      const file = path.join(dir, 'standard.yaml');
      fs.writeFileSync(file, STANDARD);
      const rollback: Array<() => void> = [];
      const ids = { oldId: 'typescript/ts-release', newId: 'typescript/ts-ship' };
      assert.equal(moveStandardMember(dir, ids, rollback), file);
      assert.match(fs.readFileSync(file, 'utf8'), /ts-ship/);
      for (const step of rollback.reverse()) step();
      assert.equal(fs.readFileSync(file, 'utf8'), STANDARD);
    });
  });

  it('should leave a catalog without standard.yaml alone', async () => {
    await withTempDirAsync(async dir => {
      const ids = { oldId: 'a/b', newId: 'a/c' };
      assert.equal(moveStandardMember(dir, ids, []), undefined);
    });
  });
});
