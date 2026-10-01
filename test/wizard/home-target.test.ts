/**
 * The menu's update / remove / status / clean-up act on one tool at a time. When only one tool has
 * installs it is used without asking; when two do, the user is asked; a damaged record asks nothing.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chooseInstalledTarget, installedTargets } from '../../dist-cli/wizard/home-target';
import { saveManifest } from '../../dist-cli/manifest';
import type { ManifestEntry } from '../../dist-cli/manifest/types';
import { mockClack } from '../helpers/clack-mock';
import type { MockAnswer } from '../helpers/clack-mock';
import { withTempDirAsync } from '../helpers/temp-dir';

const entry = (id: string, target: string): ManifestEntry =>
  ({
    id,
    kind: 'rule',
    target,
    sigilVersion: '0.0.0',
    files: [],
    dependentOf: [],
    installedAt: '2026-01-01T00:00:00.000Z',
  }) as ManifestEntry;

async function choose(dir: string, answers: MockAnswer[]): Promise<string | undefined | null> {
  const restore = mockClack(answers);
  try {
    return await chooseInstalledTarget(dir);
  } finally {
    restore();
  }
}

describe('chooseInstalledTarget', () => {
  it('should leave the choice to the command when nothing is installed', async () => {
    await withTempDirAsync(async dir => {
      assert.equal(await choose(dir, []), undefined);
    });
  });

  it('should use the only tool that has installs, even if another is detected first', async () => {
    await withTempDirAsync(async dir => {
      fs.mkdirSync(path.join(dir, '.claude'));
      saveManifest(dir, { manifestVersion: 2, entries: [entry('a/b', 'copilot')] });
      assert.equal(await choose(dir, []), 'copilot');
    });
  });

  it('should ask which tool when two have installs', async () => {
    await withTempDirAsync(async dir => {
      const entries = [entry('a/b', 'claude'), entry('c/d', 'copilot')];
      saveManifest(dir, { manifestVersion: 2, entries });
      assert.equal(await choose(dir, ['copilot']), 'copilot');
      assert.deepEqual(installedTargets(dir), ['claude', 'copilot']);
    });
  });

  it('should return null when the user cancels the question', async () => {
    await withTempDirAsync(async dir => {
      const entries = [entry('a/b', 'claude'), entry('c/d', 'copilot')];
      saveManifest(dir, { manifestVersion: 2, entries });
      assert.equal(await choose(dir, [Symbol('cancel')]), null);
    });
  });

  it('should not ask when the install record is damaged', async () => {
    await withTempDirAsync(async dir => {
      fs.mkdirSync(path.join(dir, '.sigil'));
      fs.writeFileSync(path.join(dir, '.sigil', 'manifest.json'), '{ not json');
      assert.equal(await choose(dir, []), undefined);
    });
  });
});
