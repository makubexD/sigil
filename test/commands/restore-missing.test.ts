/**
 * "Restore deleted files" in the home menu. `sigil update` does not recreate a deleted whole-file
 * artifact and `sigil add` has to be told which ones, so restoring is its own small action:
 * whole files come back through `add`, config fragments through `update`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import { restoreMissing } from '../../dist-cli/commands/restore-missing';
import { loadManifest } from '../../dist-cli/manifest';
import { withTempDirAsync } from '../helpers/temp-dir';

const CATALOG = path.resolve(__dirname, '../../catalog');
const PACKS = path.resolve(__dirname, '../../packs.yaml');
const GIT = '.claude/rules/shared-git.md';
const CLEAN = '.claude/rules/shared-clean-code.md';

async function install(dir: string): Promise<void> {
  await runAdd(['rule:shared/git', 'rule:shared/clean-code'], {
    projectDir: dir,
    catalogDir: CATALOG,
    packs: PACKS,
    target: 'claude',
    deps: true,
    dryRun: false,
    interactive: false,
    yes: true,
    overwrite: false,
    settingsLocal: false,
  });
}

const options = (dir: string) => ({ projectDir: dir, catalogDir: CATALOG, packs: PACKS });

describe('restoreMissing', () => {
  it('should bring back a deleted whole-file artifact and leave the others alone', async () => {
    await withTempDirAsync(async dir => {
      await install(dir);
      fs.rmSync(path.join(dir, GIT));
      fs.writeFileSync(path.join(dir, CLEAN), 'my own edit\n');
      const restored = await restoreMissing(options(dir));
      assert.deepEqual(restored, ['shared/git']);
      assert.equal(fs.existsSync(path.join(dir, GIT)), true);
      assert.equal(fs.readFileSync(path.join(dir, CLEAN), 'utf8'), 'my own edit\n');
    });
  });

  it('should keep the install record intact', async () => {
    await withTempDirAsync(async dir => {
      await install(dir);
      fs.rmSync(path.join(dir, GIT));
      await restoreMissing(options(dir));
      assert.deepEqual(
        loadManifest(dir)
          .entries.map(e => e.id)
          .sort(),
        ['shared/clean-code', 'shared/git'],
      );
    });
  });

  it('should do nothing when nothing is missing', async () => {
    await withTempDirAsync(async dir => {
      await install(dir);
      assert.deepEqual(await restoreMissing(options(dir)), []);
    });
  });
});
