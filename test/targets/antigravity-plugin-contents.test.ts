/**
 * What each Antigravity plugin holds, computed from the same pack membership and config-plugin
 * selection the build writes. Checked against a real `build --target antigravity`: the keys are
 * the built plugin folders, the ids are the files inside them, and two builds are byte-identical.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { parsePacksConfig } from '../../dist-cli/packs-config';
import { AntigravityTarget } from '../../dist-cli/targets/antigravity';
import { antigravityPluginContents } from '../../dist-cli/targets/antigravity/plugin-contents';
import type { Pack } from '../../dist-cli/types';
import { loadResolvedCatalog } from '../helpers/catalog';
import { CATALOG, PACKS as BUNDLED_PACKS } from '../helpers/install-scenario';
import { withTempDirAsync } from '../helpers/temp-dir';

const execFileAsync = promisify(execFile);
const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const TYPESCRIPT_STARTER = 'typescript-starter';

/** The real `packs.yaml`, parsed — the build's pack membership. */
function realPacks(): Pack[] {
  return parsePacksConfig(fs.readFileSync(BUNDLED_PACKS, 'utf8'), BUNDLED_PACKS).packs;
}

/** Runs `build --target antigravity` into `outDir` as a separate CLI process. */
async function buildInto(outDir: string): Promise<void> {
  await execFileAsync(
    process.execPath,
    [
      CLI,
      'build',
      '--target',
      'antigravity',
      '--catalog-dir',
      CATALOG,
      '--packs',
      BUNDLED_PACKS,
      '--out-dir',
      outDir,
    ],
    { encoding: 'utf8', windowsHide: true },
  );
}

/** The built plugin folders of an `antigravity` output root, sorted. */
function pluginFolders(outDir: string): string[] {
  return fs
    .readdirSync(path.join(outDir, 'antigravity', 'plugins'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

/** The `skills/` folder names and `agents/` file names of one built plugin, sorted. */
function builtMembers(outDir: string, plugin: string): { skills: string[]; agents: string[] } {
  const dir = path.join(outDir, 'antigravity', 'plugins', plugin);
  const names = (sub: string, strip?: RegExp): string[] => {
    const full = path.join(dir, sub);
    if (!fs.existsSync(full)) return [];
    return fs
      .readdirSync(full, { withFileTypes: true })
      .filter(entry => entry.isDirectory() || entry.isFile())
      .map(entry => (strip ? entry.name.replace(strip, '') : entry.name))
      .sort();
  };
  return { skills: names('skills'), agents: names('agents', /\.md$/) };
}

/**
 * Byte-exact recursive snapshot of `root`: every regular file's POSIX-relative path mapped to a
 * short sha256 hex of its raw contents, with keys sorted so `deepStrictEqual` compares order too.
 */
function fileMap(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const rel = path.relative(root, full).split(path.sep).join('/');
        files[rel] = createHash('sha256').update(fs.readFileSync(full)).digest('hex');
      }
    }
  };
  walk(root);
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(files).sort()) sorted[key] = files[key] as string;
  return sorted;
}

describe('antigravityPluginContents', () => {
  it('should name exactly the plugin folders a build writes', async () => {
    const catalog = await loadResolvedCatalog();
    await withTempDirAsync(async root => {
      await buildInto(root);

      const contents = antigravityPluginContents(catalog, realPacks());

      assert.deepEqual([...contents.keys()].sort(), pluginFolders(root));
      assert.deepEqual(
        new AntigravityTarget().marketplacePluginContents(catalog, realPacks()),
        contents,
        'the target exposes the same contents',
      );
    });
  });

  it('should give typescript-starter exactly its built skills and agents, no rules', async () => {
    const catalog = await loadResolvedCatalog();
    await withTempDirAsync(async root => {
      await buildInto(root);

      const ids = antigravityPluginContents(catalog, realPacks()).get(TYPESCRIPT_STARTER);
      assert.ok(ids, `${TYPESCRIPT_STARTER} is a built plugin`);

      const kinds = ids.map(id => {
        const artifact = catalog.byId.get(id);
        assert.ok(artifact, `${id} is a catalog id`);
        return artifact.kind;
      });
      assert.ok(
        kinds.every(kind => kind === 'skill' || kind === 'agent'),
        `no rule or config id: ${ids.filter(
          (id, index) => kinds[index] !== 'skill' && kinds[index] !== 'agent',
        )}`,
      );

      const built = builtMembers(root, TYPESCRIPT_STARTER);
      const namesOf = (kind: 'skill' | 'agent'): string[] =>
        ids
          .filter(id => catalog.byId.get(id)?.kind === kind)
          .map(id => catalog.byId.get(id)?.frontmatter.name as string)
          .sort();

      assert.deepEqual(namesOf('skill'), built.skills, 'skill names match the built folder');
      assert.deepEqual(namesOf('agent'), built.agents, 'agent names match the built folder');
    });
  });

  it('should emit byte-identical antigravity trees from two builds', async () => {
    await withTempDirAsync(async root => {
      const first = path.join(root, 'first');
      const second = path.join(root, 'second');
      await buildInto(first);
      await buildInto(second);

      assert.deepEqual(
        fileMap(path.join(second, 'antigravity')),
        fileMap(path.join(first, 'antigravity')),
        'two builds of the same catalog must be byte-identical',
      );
    });
  });
});
