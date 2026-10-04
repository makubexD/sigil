/**
 * Every file sigil takes from a catalog or an import source is read the same safe way: a regular
 * file (a symbolic link is never followed, so a link to ~/.ssh/config can't be read into the
 * catalog), within a size cap, checked and read through one open handle. A rejected file is skipped
 * with a reason, never a crash.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../dist-cli/load';
import { runImport } from '../dist-cli/commands/import';
import { withTempDirAsync } from './helpers/temp-dir';

const KIB = 1024;
const TOO_BIG = 'x'.repeat(1025 * KIB);
const SKILL = (id: string, name: string, body = 'Body.') =>
  `---\nid: ${id}\nkind: skill\nname: ${name}\ntitle: P\ndescription: A probe. Use when probing.\n---\n\n${body}\n`;
const SOURCE_SKILL = '---\nname: demo\ndescription: Demo. Use when testing.\n---\n\nBody.\n';

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Creates a file symlink, or reports that this machine cannot (Windows without privilege). */
function linkFile(target: string, link: string): boolean {
  fs.mkdirSync(path.dirname(link), { recursive: true });
  try {
    fs.symlinkSync(target, link, 'file');
    return true;
  } catch {
    return false;
  }
}

async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const original = { log: console.log, warn: console.warn };
  console.log = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, original);
  }
}

const importShared = (source: string, catalogDir: string) =>
  runImport(source, {
    shared: true,
    catalogDir,
    dryRun: false,
    yes: true,
    overwrite: false,
    createLanguage: false,
  });

describe('catalog loader — artifact files', () => {
  it('should skip an artifact file over the size cap with a warning', async () => {
    await withTempDirAsync(async root => {
      write(path.join(root, 'shared/skills/big/SKILL.md'), SKILL('shared/big', 'big', TOO_BIG));
      const catalog = await loadCatalog(root);
      assert.equal(catalog.byId.has('shared/big'), false);
      assert.match(catalog.skipWarnings.join('\n'), /big[\\/]SKILL\.md/);
    });
  });

  it('should not follow an artifact file that is a symbolic link', async t => {
    await withTempDirAsync(async root => {
      const outside = path.join(root, 'outside.md');
      write(outside, SKILL('shared/linked', 'linked'));
      const catalogDir = path.join(root, 'catalog');
      if (!linkFile(outside, path.join(catalogDir, 'shared/skills/linked/SKILL.md'))) {
        return t.skip('this machine cannot create file symlinks');
      }
      const catalog = await loadCatalog(catalogDir);
      assert.equal(catalog.byId.has('shared/linked'), false);
    });
  });
});

describe('sigil import — source files', () => {
  it('should not import a source file over the size cap', async () => {
    await withTempDirAsync(async root => {
      const source = path.join(root, 'source');
      write(path.join(source, 'skills/demo/SKILL.md'), SOURCE_SKILL + TOO_BIG);
      const catalogDir = path.join(root, 'catalog');
      fs.mkdirSync(path.join(catalogDir, 'shared'), { recursive: true });
      await quietly(() => importShared(source, catalogDir));
      assert.equal(fs.existsSync(path.join(catalogDir, 'shared/skills/demo')), false);
    });
  });

  it('should not follow a source SKILL.md that is a symbolic link', async t => {
    await withTempDirAsync(async root => {
      const secret = path.join(root, 'secret-config');
      write(secret, '---\nname: demo\ndescription: leaked\n---\n\nprivate\n');
      const source = path.join(root, 'source');
      if (!linkFile(secret, path.join(source, 'skills/demo/SKILL.md'))) {
        return t.skip('this machine cannot create file symlinks');
      }
      const catalogDir = path.join(root, 'catalog');
      fs.mkdirSync(path.join(catalogDir, 'shared'), { recursive: true });
      await quietly(() => importShared(source, catalogDir));
      assert.equal(fs.existsSync(path.join(catalogDir, 'shared/skills/demo')), false);
    });
  });
});
