/**
 * "Search the catalog" in the home menu: type a word, pick a result from a list (nobody has to copy
 * an id), see its details, and optionally install it. No results is said plainly.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { search } from '../../dist-cli/wizard/home-browse';
import { mockClack } from '../helpers/clack-mock';
import type { MockAnswer } from '../helpers/clack-mock';
import { withTempDirAsync } from '../helpers/temp-dir';

const BACK = '::back';

async function runSearch(dir: string, answers: MockAnswer[]) {
  const infos: string[] = [];
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => void logged.push(args.join(' '));
  const restore = mockClack(answers);
  const clack = require('@clack/prompts') as { log: { info: (m: string) => void } };
  clack.log.info = (message: string) => void infos.push(message);
  try {
    await search(dir);
  } finally {
    restore();
    console.log = originalLog;
  }
  return { infos, logged };
}

describe('search from the home menu', () => {
  it('should say so, and ask nothing more, when nothing matches', async () => {
    await withTempDirAsync(async dir => {
      const { infos } = await runSearch(dir, ['zzqqxx-no-such-thing']); // any more prompts would throw
      assert.match(infos.join('\n'), /No matches for 'zzqqxx-no-such-thing'/);
    });
  });

  it('should not offer what the tool in this folder cannot take, and say so', async () => {
    await withTempDirAsync(async dir => {
      fs.mkdirSync(path.join(dir, '.github', 'prompts'), { recursive: true }); // a Copilot project
      // Copilot has no hooks, so the only match is hidden and no list is shown (a prompt would throw).
      const { infos } = await runSearch(dir, ['protect-config']);
      assert.match(infos.join(' '), /GitHub Copilot/);
    });
  });

  it('should do nothing when the query is left empty or cancelled', async () => {
    await withTempDirAsync(async dir => {
      await runSearch(dir, ['']);
      await runSearch(dir, [Symbol('cancel')]);
    });
  });

  it('should go back to the menu when the user picks "Back" from the results', async () => {
    await withTempDirAsync(async dir => {
      await runSearch(dir, ['git', BACK]);
      assert.equal(fs.existsSync(path.join(dir, '.claude')), false);
    });
  });

  it('should show details of the picked result, and install nothing when declined', async () => {
    await withTempDirAsync(async dir => {
      const { logged } = await runSearch(dir, ['git', 'shared/git', false]);
      assert.match(logged.join('\n'), /shared\/git/);
      assert.equal(fs.existsSync(path.join(dir, '.claude')), false);
    });
  });

  it('should install the picked result into the folder when the user agrees', async () => {
    await withTempDirAsync(async dir => {
      await runSearch(dir, ['git', 'shared/git', true]);
      assert.equal(fs.existsSync(path.join(dir, '.claude', 'rules', 'shared-git.md')), true);
    });
  });
});
