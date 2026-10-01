/**
 * The folder picker is a loop of arrow-key selects: step into a folder, go up, type a path, use
 * the folder on screen, or go back. It only ever returns a folder that exists, or `null`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pickFolder } from '../../dist-cli/wizard/folder-picker';
import { FOLDER_CHOICE } from '../../dist-cli/wizard/folder-list';
import { mockClack } from '../helpers/clack-mock';
import type { MockAnswer } from '../helpers/clack-mock';
import { withTempDirAsync } from '../helpers/temp-dir';

const HOME = '/nowhere/home';

async function pick(current: string, answers: MockAnswer[]): Promise<string | null> {
  const restore = mockClack(answers);
  try {
    return await pickFolder(current, HOME);
  } finally {
    restore();
  }
}

describe('pickFolder', () => {
  it('should step into a folder and use it', async () => {
    await withTempDirAsync(async dir => {
      const app = path.join(dir, 'app');
      const inner = path.join(app, 'inner');
      fs.mkdirSync(inner, { recursive: true });
      // browsing starts at the parent of `app`, which is `dir`
      assert.equal(await pick(app, [app, inner, FOLDER_CHOICE.use]), inner);
    });
  });

  it('should go up one level and use the parent', async () => {
    await withTempDirAsync(async dir => {
      const app = path.join(dir, 'app');
      fs.mkdirSync(app);
      // starts at dir (parent of app); up moves to dir's parent
      const result = await pick(app, [FOLDER_CHOICE.up, FOLDER_CHOICE.use]);
      assert.equal(result, path.dirname(dir));
    });
  });

  it('should return a typed folder that exists', async () => {
    await withTempDirAsync(async dir => {
      const other = path.join(dir, 'other');
      fs.mkdirSync(other);
      assert.equal(await pick(dir, [FOLDER_CHOICE.type, other]), other);
    });
  });

  it('should go back to browsing when the typed path does not exist', async () => {
    await withTempDirAsync(async dir => {
      const answers = [FOLDER_CHOICE.type, path.join(dir, 'missing'), FOLDER_CHOICE.back];
      assert.equal(await pick(dir, answers), null);
    });
  });

  it('should return null on "back to menu"', async () => {
    await withTempDirAsync(async dir => {
      assert.equal(await pick(dir, [FOLDER_CHOICE.back]), null);
    });
  });

  it('should return null when the user cancels', async () => {
    await withTempDirAsync(async dir => {
      assert.equal(await pick(dir, [Symbol('cancel')]), null);
    });
  });

  it('should return to browsing when cancelling the typed path', async () => {
    await withTempDirAsync(async dir => {
      const answers = [FOLDER_CHOICE.type, Symbol('cancel'), FOLDER_CHOICE.use];
      assert.equal(await pick(dir, answers), path.dirname(dir));
    });
  });
});
