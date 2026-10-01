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

  it('should create a typed folder that does not exist when the user says yes', async () => {
    await withTempDirAsync(async dir => {
      const target = path.join(dir, 'new', 'app');
      assert.equal(await pick(dir, [FOLDER_CHOICE.type, target, true]), target);
      assert.ok(fs.statSync(target).isDirectory());
    });
  });

  it('should create nothing and keep browsing when the user says no', async () => {
    await withTempDirAsync(async dir => {
      const target = path.join(dir, 'missing');
      const answers = [FOLDER_CHOICE.type, target, false, FOLDER_CHOICE.back];
      assert.equal(await pick(dir, answers), null);
      assert.equal(fs.existsSync(target), false);
    });
  });

  it('should keep browsing when the folder cannot be created', async () => {
    await withTempDirAsync(async dir => {
      const target = path.join(dir, 'bad\0name');
      const answers = [FOLDER_CHOICE.type, target, true, FOLDER_CHOICE.back];
      assert.equal(await pick(dir, answers), null);
    });
  });

  it('should create a named folder inside the folder being browsed', async () => {
    await withTempDirAsync(async dir => {
      const child = path.join(dir, 'child');
      fs.mkdirSync(child);
      // browsing starts at the parent of `child`, which is `dir`
      const made = path.join(dir, 'my-project');
      assert.equal(await pick(child, [FOLDER_CHOICE.create, 'my-project']), made);
      assert.ok(fs.statSync(made).isDirectory());
    });
  });

  it('should keep browsing when the new folder name is cancelled', async () => {
    await withTempDirAsync(async dir => {
      const answers = [FOLDER_CHOICE.create, Symbol('cancel'), FOLDER_CHOICE.back];
      assert.equal(await pick(dir, answers), null);
    });
  });

  it('should keep browsing when the new folder name is not valid', async () => {
    await withTempDirAsync(async dir => {
      const child = path.join(dir, 'child');
      fs.mkdirSync(child);
      const answers = [FOLDER_CHOICE.create, 'a/b', FOLDER_CHOICE.back];
      assert.equal(await pick(child, answers), null);
      assert.equal(fs.existsSync(path.join(dir, 'a')), false);
    });
  });

  it('should keep browsing when the typed path is under a file', async () => {
    await withTempDirAsync(async dir => {
      fs.writeFileSync(path.join(dir, 'a.txt'), '');
      const answers = [FOLDER_CHOICE.type, path.join(dir, 'a.txt', 'x'), FOLDER_CHOICE.back];
      assert.equal(await pick(dir, answers), null);
    });
  });

  it('should start with the cursor on the folder the user came from', async () => {
    await withTempDirAsync(async dir => {
      const app = path.join(dir, 'app');
      fs.mkdirSync(app);
      const restore = mockClack([FOLDER_CHOICE.back]);
      const clack = require('@clack/prompts') as { select: (o: unknown) => Promise<unknown> };
      const original = clack.select;
      let seen: unknown;
      clack.select = async (o: unknown) => {
        seen = (o as { initialValue?: unknown }).initialValue;
        return original(o);
      };
      try {
        await pickFolder(app, HOME);
      } finally {
        restore();
      }
      assert.equal(seen, app);
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
