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
import { createRecorder, mockClack } from '../helpers/clack-mock';
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
        const rec = createRecorder();
        const restore = mockClack(answers, rec);
        try {
          await runUninstall([], { ...OPTS, projectDir: dir });
        } finally {
          restore();
          restoreTTY();
        }
        messages.push(...rec.copied);
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
      assert.ok(keep.messages.includes('   sigil uninstall a/one --yes --target claude'));
      const del = await removeEdited([['a/one'], 'delete', true]);
      assert.ok(del.messages.includes('   sigil uninstall a/one --yes --force --target claude'));
      const declined = await removeEdited([['a/one'], 'keep', false]);
      assert.deepEqual(
        declined.messages.filter(m => m.trim().startsWith('sigil uninstall')),
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

describe('short answers instead of id lists', () => {
  const MANY = ['a/one', 'b/two', 'c/three', 'd/four'];

  function crowded(dir: string): void {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    saveManifest(dir, {
      manifestVersion: 2,
      entries: MANY.map((id, i) => install(dir, id, `.claude/rules/r${i}.md`)),
    });
  }

  async function run(
    ids: string[],
    answers: Array<string | boolean | string[] | symbol>,
    terminal: boolean,
  ) {
    const rec = createRecorder();
    const printed: string[] = [];
    const original = console.log;
    console.log = (text: unknown) => void printed.push(String(text));
    await withTempDirAsync(async dir => {
      crowded(dir);
      const restoreTTY = terminal ? fakeTTY() : () => {};
      const restore = mockClack(answers, rec);
      try {
        await runUninstall(ids, { ...OPTS, yes: !terminal, projectDir: dir });
      } finally {
        restore();
        restoreTTY();
        console.log = original;
      }
    });
    return { rec, printed: printed.join('\n') };
  }

  it('should count the artifacts in the question and list them once above it, when there are many', async () => {
    const { rec } = await run([], [MANY, true], true);
    const question = rec.prompts.find(p => p.kind === 'confirm')?.message;
    assert.equal(question, "Remove 4 artifacts from 'claude'?");
    assert.ok(rec.logs.includes(`info: Removing: ${MANY.join(', ')}`));
  });

  it('should keep the names in the question when there are only a few', async () => {
    const { rec } = await run([], [['a/one', 'b/two'], true], true);
    assert.equal(
      rec.prompts.find(p => p.kind === 'confirm')?.message,
      "Remove a/one, b/two from 'claude'?",
    );
    assert.equal(rec.logs.filter(l => l.startsWith('info: Removing')).length, 0);
  });

  it('should summarise a long removal by count in a terminal, with the ids as a paragraph', async () => {
    const { printed } = await run([], [MANY, true], true);
    assert.match(printed, /✓ Uninstalled 4 artifacts {2}\(4 file\(s\) removed\)/);
    assert.match(printed, /^ {2}a\/one, b\/two, c\/three, d\/four$/m);
  });

  it('should keep the one-line summary with every id for a script', async () => {
    const { printed } = await run(MANY, [], false);
    assert.match(
      printed,
      /✓ Uninstalled: a\/one, b\/two, c\/three, d\/four {2}\(4 file\(s\) removed\)/,
    );
  });
});
