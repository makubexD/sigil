/**
 * Tests for src/commands/update-wholefile.ts — whole-file entry re-scaffold/partition/write
 * logic for `sigil update`. Covers isFileDrifted directly, and the private
 * classify/partition verdicts (unchanged / drifted-and-skipped / write) indirectly through
 * updateWholeFileEntry, using a fake target and real files in a temp dir.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isFileDrifted, updateWholeFileEntry } from '../../dist-cli/commands/update-wholefile';
import { sha256 } from '../../dist-cli/manifest';
import type { ManifestEntry } from '../../dist-cli/manifest/types';
import type { ResolvedCatalog, Target } from '../../dist-cli/types';
import type { UpdateOptions } from '../../dist-cli/commands/update';
import { withTempDir, withTempDirAsync } from '../helpers/temp-dir';
import { channelFromNativeKinds } from '../../dist-cli/targets/capabilities';

/** A Target stub whose scaffold() always returns the given fixed file map. */
function makeFakeTarget(files: Record<string, string>): Target {
  return {
    name: 'fake',
    capabilities: { scaffold: channelFromNativeKinds([], 'fake') },
    async scaffold() {
      return files;
    },
  } as unknown as Target;
}

function makeOpts(projectDir: string, overrides: Partial<UpdateOptions> = {}): UpdateOptions {
  return {
    projectDir,
    catalogDir: '/fake/catalog',
    packs: '/fake/packs.yaml',
    force: false,
    dryRun: false,
    ...overrides,
  };
}

function makeEntry(files: { path: string; sha256: string }[]): ManifestEntry {
  return {
    id: 'test/fake-rule',
    kind: 'rule',
    target: 'fake',
    sigilVersion: '0.1.0',
    files,
    dependentOf: [],
    installedAt: new Date().toISOString(),
  };
}

describe('isFileDrifted', () => {
  it('returns false when no hash was recorded (nothing to compare against)', () => {
    assert.equal(isFileDrifted('/does/not/matter', undefined), false);
  });

  it('returns false when the file does not exist on disk yet', () => {
    assert.equal(isFileDrifted('/definitely/does/not/exist.md', 'abc123'), false);
  });

  it('returns false when the file on disk matches the recorded hash', () => {
    withTempDir(dir => {
      const filePath = path.join(dir, 'f.md');
      fs.writeFileSync(filePath, 'hello');
      assert.equal(isFileDrifted(filePath, sha256('hello')), false);
    });
  });

  it('returns true when the file on disk no longer matches the recorded hash', () => {
    withTempDir(dir => {
      const filePath = path.join(dir, 'f.md');
      fs.writeFileSync(filePath, 'hand-edited content');
      assert.equal(isFileDrifted(filePath, sha256('original content')), true);
    });
  });
});

describe('updateWholeFileEntry', () => {
  it('writes a brand-new file with no recorded hash', async () => {
    await withTempDirAsync(async dir => {
      const target = makeFakeTarget({ 'rule.md': 'fresh content' });
      const entry = makeEntry([]);
      const result = await updateWholeFileEntry(
        entry,
        {} as ResolvedCatalog,
        target,
        makeOpts(dir),
      );
      assert.equal(result.updated, true);
      assert.equal(fs.readFileSync(path.join(dir, 'rule.md'), 'utf-8'), 'fresh content');
    });
  });

  it('is a no-op when the freshly scaffolded content matches the recorded hash', async () => {
    await withTempDirAsync(async dir => {
      fs.writeFileSync(path.join(dir, 'rule.md'), 'unchanged content');
      const target = makeFakeTarget({ 'rule.md': 'unchanged content' });
      const entry = makeEntry([{ path: 'rule.md', sha256: sha256('unchanged content') }]);
      const result = await updateWholeFileEntry(
        entry,
        {} as ResolvedCatalog,
        target,
        makeOpts(dir),
      );
      assert.equal(result.updated, false);
      assert.equal(result.skippedDriftCount, 0);
    });
  });

  it('skips a drifted file (hand-edited on disk) without --force', async () => {
    await withTempDirAsync(async dir => {
      fs.writeFileSync(path.join(dir, 'rule.md'), 'hand-edited by the user');
      const target = makeFakeTarget({ 'rule.md': 'new catalog content' });
      const entry = makeEntry([{ path: 'rule.md', sha256: sha256('original catalog content') }]);
      const result = await updateWholeFileEntry(
        entry,
        {} as ResolvedCatalog,
        target,
        makeOpts(dir),
      );
      assert.equal(result.updated, false);
      assert.equal(result.skippedDriftCount, 1);
      assert.equal(
        fs.readFileSync(path.join(dir, 'rule.md'), 'utf-8'),
        'hand-edited by the user',
        'drifted file is left untouched without --force',
      );
    });
  });

  it('overwrites a drifted file when --force is set', async () => {
    await withTempDirAsync(async dir => {
      fs.writeFileSync(path.join(dir, 'rule.md'), 'hand-edited by the user');
      const target = makeFakeTarget({ 'rule.md': 'new catalog content' });
      const entry = makeEntry([{ path: 'rule.md', sha256: sha256('original catalog content') }]);
      const result = await updateWholeFileEntry(
        entry,
        {} as ResolvedCatalog,
        target,
        makeOpts(dir, { force: true }),
      );
      assert.equal(result.updated, true);
      assert.equal(fs.readFileSync(path.join(dir, 'rule.md'), 'utf-8'), 'new catalog content');
    });
  });

  it('migrates a stale recorded path when the scaffold output moves to a new path', async () => {
    await withTempDirAsync(async dir => {
      fs.mkdirSync(path.join(dir, '.claude', 'commands'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.claude', 'commands', 'deploy.md'), 'old command content');
      const target = makeFakeTarget({
        '.claude/skills/deploy/SKILL.md': 'new skill content',
      });
      const entry = makeEntry([
        { path: '.claude/commands/deploy.md', sha256: sha256('old command content') },
      ]);

      const result = await updateWholeFileEntry(
        entry,
        {} as ResolvedCatalog,
        target,
        makeOpts(dir),
      );

      assert.equal(result.updated, true);
      assert.equal(
        fs.existsSync(path.join(dir, '.claude', 'commands', 'deploy.md')),
        false,
        'the stale path is removed once superseded',
      );
      assert.equal(
        fs.readFileSync(path.join(dir, '.claude', 'skills', 'deploy', 'SKILL.md'), 'utf-8'),
        'new skill content',
      );
      assert.deepEqual(
        entry.files.map(f => f.path),
        ['.claude/skills/deploy/SKILL.md'],
        'the manifest now tracks only the current path — the new file is not left untracked',
      );
    });
  });

  it('keeps a stale path when its on-disk content was hand-edited', async () => {
    await withTempDirAsync(async dir => {
      fs.mkdirSync(path.join(dir, '.claude', 'commands'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.claude', 'commands', 'deploy.md'),
        'hand-edited by the user',
      );
      const target = makeFakeTarget({
        '.claude/skills/deploy/SKILL.md': 'new skill content',
      });
      const entry = makeEntry([
        { path: '.claude/commands/deploy.md', sha256: sha256('original recorded content') },
      ]);

      await updateWholeFileEntry(entry, {} as ResolvedCatalog, target, makeOpts(dir));

      assert.equal(
        fs.readFileSync(path.join(dir, '.claude', 'commands', 'deploy.md'), 'utf-8'),
        'hand-edited by the user',
        'a locally-edited stale file is never silently deleted',
      );
      assert.ok(
        entry.files.some(f => f.path === '.claude/commands/deploy.md'),
        'the kept stale file stays tracked in the manifest',
      );
    });
  });

  it('dry-run mode never writes to disk', async () => {
    await withTempDirAsync(async dir => {
      const target = makeFakeTarget({ 'rule.md': 'fresh content' });
      const entry = makeEntry([]);
      const result = await updateWholeFileEntry(
        entry,
        {} as ResolvedCatalog,
        target,
        makeOpts(dir, { dryRun: true }),
      );
      assert.equal(result.updated, false);
      assert.equal(fs.existsSync(path.join(dir, 'rule.md')), false);
    });
  });
});
