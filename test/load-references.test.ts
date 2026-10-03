/**
 * A skill's `references/` files are shipped to every user who installs the skill, so the loader only
 * takes plain, reasonably sized Markdown files with safe names, and `sigil check --trust` scans them
 * like the skill itself. A rejected file is skipped with a load warning, never a crash, so a catalog
 * with one bad file still loads.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../dist-cli/load';
import { runCheck } from '../dist-cli/commands/check';
import { withTempDirAsync } from './helpers/temp-dir';

const SKILL_MD = `---
id: shared/probe
kind: skill
name: probe
title: Probe
description: A probe skill for reference-loading tests. Use when testing.
whenToUse: Use when testing reference loading.
---

# Probe

Read \`references/notes.md\`.
`;
const KIB = 1024;
const FAKE_AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';

/** A catalog with one shared skill whose references are `files` (name → content). */
function writeCatalog(root: string, files: Record<string, string>): string {
  const skillDir = path.join(root, 'catalog', 'shared', 'skills', 'probe');
  fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), SKILL_MD);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(skillDir, 'references', name), content);
  }
  return path.join(root, 'catalog');
}

async function referencesOf(catalogDir: string) {
  const catalog = await loadCatalog(catalogDir);
  return {
    names: (catalog.byId.get('shared/probe')?.references ?? []).map(r => r.name),
    warnings: catalog.skipWarnings,
  };
}

describe('skill references — loading', () => {
  it('should load safe Markdown files in name order', async () => {
    await withTempDirAsync(async root => {
      const dir = writeCatalog(root, { 'zeta.md': 'z', 'alpha.md': 'a', 'notes.txt': 'x' });
      const { names, warnings } = await referencesOf(dir);
      assert.deepEqual(names, ['alpha.md', 'zeta.md']);
      assert.deepEqual(warnings, []);
    });
  });

  it('should skip a file whose name is not kebab-case Markdown', async () => {
    await withTempDirAsync(async root => {
      const dir = writeCatalog(root, { 'ok.md': 'a', 'Bad Name.md': 'b' });
      const { names, warnings } = await referencesOf(dir);
      assert.deepEqual(names, ['ok.md']);
      assert.match(warnings.join('\n'), /Bad Name\.md/);
    });
  });

  it('should skip a file over the per-file size limit', async () => {
    await withTempDirAsync(async root => {
      const dir = writeCatalog(root, { 'ok.md': 'a', 'huge.md': 'x'.repeat(257 * KIB) });
      const { names, warnings } = await referencesOf(dir);
      assert.deepEqual(names, ['ok.md']);
      assert.match(warnings.join('\n'), /huge\.md/);
    });
  });

  it('should stop at the per-skill size limit', async () => {
    await withTempDirAsync(async root => {
      const files = Object.fromEntries(
        ['a', 'b', 'c', 'd', 'e'].map(n => [`${n}.md`, 'x'.repeat(250 * KIB)]),
      );
      const { names, warnings } = await referencesOf(writeCatalog(root, files));
      assert.deepEqual(names, ['a.md', 'b.md', 'c.md', 'd.md']);
      assert.match(warnings.join('\n'), /e\.md/);
    });
  });

  it('should skip a symbolic link', async t => {
    await withTempDirAsync(async root => {
      const dir = writeCatalog(root, { 'ok.md': 'a' });
      const outside = path.join(root, 'secret.md');
      fs.writeFileSync(outside, 'outside the catalog');
      const link = path.join(dir, 'shared', 'skills', 'probe', 'references', 'linked.md');
      try {
        fs.symlinkSync(outside, link);
      } catch {
        t.skip('this machine cannot create symbolic links');
        return;
      }
      const { names, warnings } = await referencesOf(dir);
      assert.deepEqual(names, ['ok.md']);
      assert.match(warnings.join('\n'), /linked\.md/);
    });
  });
});

/** Creates a directory symlink, or reports that this machine cannot (Windows without privilege). */
function linkDir(target: string, link: string): boolean {
  try {
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch {
    return false;
  }
}

describe('skill references — symbolic links above the files', () => {
  it('should not follow a references folder that is a symbolic link', async t => {
    await withTempDirAsync(async root => {
      const outside = path.join(root, 'outside');
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, 'leaked.md'), 'outside the catalog');
      const dir = writeCatalog(root, {});
      const refs = path.join(dir, 'shared', 'skills', 'probe', 'references');
      fs.rmSync(refs, { recursive: true });
      if (!linkDir(outside, refs)) return t.skip('this machine cannot create symbolic links');
      const { names, warnings } = await referencesOf(dir);
      assert.deepEqual(names, []);
      assert.match(warnings.join('\n'), /references/);
    });
  });

  it('should not load a skill folder that is a symbolic link', async t => {
    await withTempDirAsync(async root => {
      const dir = writeCatalog(root, { 'ok.md': 'a' });
      const elsewhere = path.join(root, 'elsewhere');
      fs.renameSync(path.join(dir, 'shared', 'skills', 'probe'), elsewhere);
      const link = path.join(dir, 'shared', 'skills', 'probe');
      if (!linkDir(elsewhere, link)) return t.skip('this machine cannot create symbolic links');
      const catalog = await loadCatalog(dir);
      assert.equal(catalog.byId.has('shared/probe'), false);
    });
  });
});

describe('skill references — sigil check --trust', () => {
  const check = (catalogDir: string) =>
    runCheck([path.join(catalogDir, 'shared', 'skills', 'probe', 'SKILL.md')], {
      catalogDir,
      schemaOnly: false,
      trust: true,
      strict: false,
    });

  it('should pass a skill whose references are clean', async () => {
    await withTempDirAsync(async root => {
      await check(writeCatalog(root, { 'notes.md': '# Notes\n' }));
    });
  });

  it('should fail a skill whose reference holds a secret', async () => {
    await withTempDirAsync(async root => {
      const dir = writeCatalog(root, { 'notes.md': `# Notes\n${FAKE_AWS_KEY}\n` });
      await assert.rejects(check(dir), /violation/);
    });
  });
});
