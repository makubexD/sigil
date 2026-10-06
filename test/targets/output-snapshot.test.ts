/**
 * Output snapshot: everything sigil writes for the bundled catalog, hashed per file and compared with
 * a committed baseline. A refactor of the target layer must leave every hash unchanged; a deliberate
 * content change regenerates the baseline (`npm run snapshot:update`) and the diff is reviewed.
 *
 * Covers `build` (dist/claude, dist/copilot, registry.json) and `add` into a project for both targets
 * (the representative selection in `helpers/install-scenario.ts`), plus a partial install (the
 * Boundary section lists only installed siblings) and an `update` run over the install. In-process:
 * no CLI is spawned. Normalization is in `helpers/output-tree.ts`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runBuild } from '../../dist-cli/commands/build';
import { loadCatalog } from '../../dist-cli/load';
import { withTempDirAsync } from '../helpers/temp-dir';
import { hashTree, treeDiff } from '../helpers/output-tree';
import {
  CATALOG,
  FULL_SELECTION,
  PACKS,
  TARGETS,
  add,
  seedUserConfig,
  update,
} from '../helpers/install-scenario';

const BASELINE_DIR = path.resolve(__dirname, '../../test/fixtures/output-snapshot');
const UPDATE = process.env.SIGIL_SNAPSHOT_UPDATE === '1';
const ALLOW_REMOVAL = process.env.SIGIL_SNAPSHOT_ALLOW_REMOVAL === '1';
const JSON_INDENT = 2;

/**
 * Keys the baseline has and `actual` lacks. Content may change and files may be added when the
 * baseline is regenerated, but a removed path or artifact id breaks existing installs, so dropping
 * one needs SIGIL_SNAPSHOT_ALLOW_REMOVAL=1 as well (family-skeleton-standard-2026-10.md).
 */
function removedKeys(file: string, actual: Record<string, string>): string[] {
  if (!fs.existsSync(file)) return [];
  const expected = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
  return Object.keys(expected).filter(key => !(key in actual));
}

/** Compares with the committed baseline, or rewrites it under SIGIL_SNAPSHOT_UPDATE=1. */
function matchBaseline(name: string, actual: Record<string, string>): void {
  const file = path.join(BASELINE_DIR, `${name}.json`);
  if (UPDATE) {
    const removed = ALLOW_REMOVAL ? [] : removedKeys(file, actual);
    assert.deepEqual(removed, [], `${name}: removing these needs SIGIL_SNAPSHOT_ALLOW_REMOVAL=1`);
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(actual, null, JSON_INDENT) + '\n');
    return;
  }
  assert.ok(fs.existsSync(file), `no baseline for ${name}; run npm run snapshot:update`);
  const expected = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
  assert.deepEqual(
    treeDiff(expected, actual),
    [],
    `${name} output changed (- removed, + added, ~ changed). If intended, run npm run snapshot:update and review the diff.`,
  );
}

describe('output snapshot', () => {
  it('should keep every artifact id and kind of the baseline', async () => {
    const catalog = await loadCatalog(CATALOG);
    matchBaseline('ids', Object.fromEntries(catalog.artifacts.map(a => [a.id, a.kind])));
  });

  it('should build dist/ for every target exactly as the baseline', async () => {
    await withTempDirAsync(async dir => {
      await runBuild({ target: 'all', catalogDir: CATALOG, packs: PACKS, outDir: dir });
      matchBaseline('build', hashTree(dir));
    });
  });

  for (const target of TARGETS) {
    it(`should install a full selection for ${target} exactly as the baseline`, async () => {
      await withTempDirAsync(async dir => {
        seedUserConfig(dir);
        await add(dir, target, FULL_SELECTION);
        matchBaseline(`add-${target}`, hashTree(dir));
      });
    });

    it(`should install a lone skill for ${target} exactly as the baseline`, async () => {
      await withTempDirAsync(async dir => {
        await add(dir, target, ['skill:shared/cli'], false);
        matchBaseline(`add-partial-${target}`, hashTree(dir));
      });
    });

    it(`should leave a fresh ${target} install unchanged on update`, async () => {
      await withTempDirAsync(async dir => {
        seedUserConfig(dir);
        await add(dir, target, FULL_SELECTION);
        const before = hashTree(dir);
        await update(dir, target);
        assert.deepEqual(treeDiff(before, hashTree(dir)), []);
      });
    });
  }
});
