/**
 * `sigil uninstall` with no ids offers what is installed instead of failing. Without a terminal it
 * still fails, and says how to name the artifacts.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runUninstall } from '../../dist-cli/commands/uninstall';
import { loadManifest, saveManifest, sha256 } from '../../dist-cli/manifest';
import type { ManifestEntry } from '../../dist-cli/manifest/types';
import { SigilError } from '../../dist-cli/errors';
import { mockClack } from '../helpers/clack-mock';
import { fakeTTY } from '../helpers/tty';
import { withTempDirAsync } from '../helpers/temp-dir';

function install(dir: string, id: string, relative: string): ManifestEntry {
  const content = `# ${id}\n`;
  fs.mkdirSync(path.join(dir, path.dirname(relative)), { recursive: true });
  fs.writeFileSync(path.join(dir, relative), content);
  return {
    id,
    kind: 'rule',
    target: 'claude',
    sigilVersion: '0.0.0',
    files: [{ path: relative, sha256: sha256(content) }],
    dependentOf: [],
    installedAt: '2026-01-01T00:00:00.000Z',
  } as ManifestEntry;
}

function project(dir: string): void {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  saveManifest(dir, {
    manifestVersion: 2,
    entries: [
      install(dir, 'a/one', '.claude/rules/one.md'),
      install(dir, 'b/two', '.claude/rules/two.md'),
    ],
  });
}

const OPTS = { yes: false, force: false, dryRun: false, target: 'claude' } as const;
const installedIds = (dir: string): string[] => loadManifest(dir).entries.map(e => e.id);

describe('runUninstall without ids', () => {
  it('should remove the artifacts picked from the installed list', async () => {
    await withTempDirAsync(async dir => {
      project(dir);
      const restoreTTY = fakeTTY();
      const restore = mockClack([['a/one'], true]);
      try {
        await runUninstall([], { ...OPTS, projectDir: dir });
      } finally {
        restore();
        restoreTTY();
      }
      assert.deepEqual(installedIds(dir), ['b/two']);
      assert.equal(fs.existsSync(path.join(dir, '.claude/rules/one.md')), false);
      assert.equal(fs.existsSync(path.join(dir, '.claude/rules/two.md')), true);
    });
  });

  it('should change nothing when the user cancels the picker', async () => {
    await withTempDirAsync(async dir => {
      project(dir);
      const restoreTTY = fakeTTY();
      const restore = mockClack([Symbol('cancel')]);
      try {
        await runUninstall([], { ...OPTS, projectDir: dir });
      } finally {
        restore();
        restoreTTY();
      }
      assert.deepEqual(installedIds(dir), ['a/one', 'b/two']);
    });
  });

  it('should change nothing when the user declines the confirmation', async () => {
    await withTempDirAsync(async dir => {
      project(dir);
      const restoreTTY = fakeTTY();
      const restore = mockClack([['a/one'], false]);
      try {
        await runUninstall([], { ...OPTS, projectDir: dir });
      } finally {
        restore();
        restoreTTY();
      }
      assert.deepEqual(installedIds(dir), ['a/one', 'b/two']);
    });
  });

  describe('when a file was edited after install', () => {
    const EDITED = '.claude/rules/one.md';

    async function removeEdited(answers: Array<string | boolean | string[] | symbol>) {
      const messages: string[] = [];
      let result: string[] = [];
      await withTempDirAsync(async dir => {
        project(dir);
        fs.writeFileSync(path.join(dir, EDITED), 'my own edit\n');
        const restoreTTY = fakeTTY();
        const restore = mockClack(answers);
        const clack = require('@clack/prompts') as { log: { info: (m: string) => void } };
        clack.log.info = (message: string) => void messages.push(message);
        try {
          await runUninstall([], { ...OPTS, projectDir: dir });
        } finally {
          restore();
          restoreTTY();
        }
        result = [
          fs.existsSync(path.join(dir, EDITED)) ? 'file-kept' : 'file-gone',
          ...installedIds(dir),
        ];
      });
      return { messages, result };
    }

    it('should keep the edited file when the user chooses to keep it', async () => {
      const { result } = await removeEdited([['a/one'], 'keep', true]);
      assert.deepEqual(result, ['file-kept', 'b/two']);
    });

    it('should delete the edited file when the user chooses to delete it too', async () => {
      const { result } = await removeEdited([['a/one'], 'delete', true]);
      assert.deepEqual(result, ['file-gone', 'b/two']);
    });

    it('should change nothing when the user cancels the keep-or-delete question', async () => {
      const { result } = await removeEdited([['a/one'], Symbol('cancel')]);
      assert.deepEqual(result, ['file-kept', 'a/one', 'b/two']);
    });

    it('should log an equivalent command that can be pasted into a script, after confirming', async () => {
      const keep = await removeEdited([['a/one'], 'keep', true]);
      assert.ok(keep.messages.includes('Equivalent command: sigil uninstall a/one --yes'));
      const del = await removeEdited([['a/one'], 'delete', true]);
      assert.ok(del.messages.includes('Equivalent command: sigil uninstall a/one --yes --force'));
      const declined = await removeEdited([['a/one'], 'keep', false]);
      assert.deepEqual(
        declined.messages.filter(m => m.startsWith('Equivalent')),
        [],
      );
    });
  });

  it('should say there is nothing to remove, without prompting, when nothing is installed', async () => {
    await withTempDirAsync(async dir => {
      const restoreTTY = fakeTTY();
      const restore = mockClack([]); // any prompt would throw "queue exhausted"
      try {
        await runUninstall([], { ...OPTS, projectDir: dir });
      } finally {
        restore();
        restoreTTY();
      }
    });
  });

  it('should fail outside a terminal and show how to name the artifacts', async () => {
    await withTempDirAsync(async dir => {
      project(dir);
      await assert.rejects(runUninstall([], { ...OPTS, projectDir: dir }), (error: unknown) => {
        assert.ok(error instanceof SigilError);
        assert.match(error.hint ?? '', /sigil uninstall <id>/);
        assert.match(error.hint ?? '', /sigil status/);
        return true;
      });
      assert.deepEqual(installedIds(dir), ['a/one', 'b/two']);
    });
  });
});
