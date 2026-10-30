/**
 * `sigil build` replaces the target folder it builds instead of merging into it, so a rebuild
 * drops plugins and files that left the catalog. It refuses to replace a folder sigil did not
 * build (an output root with no `registry.json`), and it compiles every target before deleting
 * anything, so a failed build leaves the previous output intact.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runBuild } from '../../dist-cli/commands/build';
import { getAllTargets } from '../../dist-cli/targets';
import { CATALOG, PACKS } from '../helpers/install-scenario';
import { withTempDirAsync } from '../helpers/temp-dir';

const LEAKY_SKILL =
  '---\nid: shared/leaky\nkind: skill\nname: leaky\ntitle: Leaky\n' +
  'description: A probe skill. Use when probing.\n---\n\nRead CLAUDE.md before you start.\n';
const SEEDED_PACKS =
  'packs:\n  - name: probe\n    displayName: Probe\n    description: A probe pack.\n    artifacts: [shared/leaky]\n';

/** Writes the one-skill catalog and its packs.yaml under `root`. */
function seedCatalog(root: string): { catalogDir: string; packs: string } {
  const catalogDir = path.join(root, 'catalog');
  const skillDir = path.join(catalogDir, 'shared', 'skills', 'leaky');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), LEAKY_SKILL);
  const packs = path.join(root, 'packs.yaml');
  fs.writeFileSync(packs, SEEDED_PACKS);
  return { catalogDir, packs };
}

/** Builds `target` into `<root>/dist` with the bundled catalog, unless another one is given. */
function build(
  root: string,
  target: string,
  seeded: { catalogDir: string; packs: string } = { catalogDir: CATALOG, packs: PACKS },
): Promise<void> {
  return runBuild({ target, ...seeded, outDir: path.join(root, 'dist') });
}

describe('build replaces its output folder', () => {
  it('should remove stale plugins and files from the target folder it rebuilds', async () => {
    await withTempDirAsync(async root => {
      await build(root, 'claude');
      const stalePlugin = path.join(root, 'dist', 'claude', 'plugins', 'stale-plugin', 'SKILL.md');
      const staleNote = path.join(root, 'dist', 'claude', 'note.md');
      fs.mkdirSync(path.dirname(stalePlugin), { recursive: true });
      fs.writeFileSync(stalePlugin, '# stale\n');
      fs.writeFileSync(staleNote, '# stale\n');

      await build(root, 'claude');

      assert.equal(fs.existsSync(stalePlugin), false, 'stale plugin folder is gone');
      assert.equal(fs.existsSync(staleNote), false, 'stale file is gone');
      assert.ok(
        fs.existsSync(path.join(root, 'dist', 'claude', '.claude-plugin', 'marketplace.json')),
        'the fresh marketplace is written',
      );
    });
  });

  it('should clean every target folder when building all', async () => {
    await withTempDirAsync(async root => {
      await build(root, 'all');
      const staleFiles = getAllTargets().map(target => {
        const stale = path.join(root, 'dist', target.name, 'stale.md');
        fs.writeFileSync(stale, '# stale\n');
        return stale;
      });

      await build(root, 'all');

      for (const stale of staleFiles) {
        assert.equal(fs.existsSync(stale), false, `${stale} is gone`);
      }
    });
  });

  it('should keep folders outside the target folder it rebuilds', async () => {
    await withTempDirAsync(async root => {
      await build(root, 'all');
      const otherTargetFile = path.join(root, 'dist', 'copilot', 'stale.md');
      const otherFolderFile = path.join(root, 'dist', 'keep', 'a.txt');
      fs.writeFileSync(otherTargetFile, '# stale\n');
      fs.mkdirSync(path.dirname(otherFolderFile), { recursive: true });
      fs.writeFileSync(otherFolderFile, 'keep\n');

      await build(root, 'claude');

      assert.ok(fs.existsSync(otherTargetFile), 'a target that was not built is untouched');
      assert.ok(fs.existsSync(otherFolderFile), 'an unrelated folder is untouched');
    });
  });

  it('should refuse to replace a target folder in an output root with no registry.json', async () => {
    await withTempDirAsync(async root => {
      const outDir = path.join(root, 'dist');
      const mine = path.join(outDir, 'claude', 'mine.md');
      fs.mkdirSync(path.dirname(mine), { recursive: true });
      fs.writeFileSync(mine, 'mine\n');

      await assert.rejects(build(root, 'claude'), {
        name: 'SigilError',
        message: /registry\.json/,
      });

      assert.ok(fs.existsSync(mine), 'the user file survives');
      assert.equal(fs.existsSync(path.join(outDir, 'registry.json')), false, 'no registry written');
      assert.equal(
        fs.existsSync(path.join(outDir, 'claude', 'plugins')),
        false,
        'nothing was built',
      );
    });
  });

  it('should check the guard before deleting any target folder', async () => {
    await withTempDirAsync(async root => {
      await build(root, 'claude');
      const outDir = path.join(root, 'dist');
      fs.rmSync(path.join(outDir, 'registry.json'));
      const mine = path.join(outDir, 'copilot', 'mine.md');
      fs.mkdirSync(path.dirname(mine), { recursive: true });
      fs.writeFileSync(mine, 'mine\n');

      await assert.rejects(build(root, 'all'), {
        name: 'SigilError',
        message: /registry\.json/,
      });

      assert.ok(fs.existsSync(mine), 'the unbuilt target folder survives');
      assert.ok(
        fs.existsSync(path.join(outDir, 'claude', '.claude-plugin', 'marketplace.json')),
        'the built target folder survives',
      );
      assert.equal(fs.existsSync(path.join(outDir, 'registry.json')), false, 'no registry written');
    });
  });

  it('should leave the previous output intact when a build fails', async () => {
    await withTempDirAsync(async root => {
      const seeded = seedCatalog(root);
      await build(root, 'claude', seeded);
      const stale = path.join(root, 'dist', 'claude', 'stale.md');
      fs.writeFileSync(stale, '# stale\n');

      await assert.rejects(build(root, 'all', seeded), /output-conformance/);

      assert.ok(fs.existsSync(stale), 'the previous output is untouched');
    });
  });

  it('should build into an output root that does not exist yet', async () => {
    await withTempDirAsync(async root => {
      assert.equal(fs.existsSync(path.join(root, 'dist')), false, 'the output root is absent');

      await build(root, 'claude');

      assert.ok(fs.existsSync(path.join(root, 'dist', 'registry.json')), 'registry written');
    });
  });
});
