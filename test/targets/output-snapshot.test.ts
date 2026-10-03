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
const JSON_INDENT = 2;

/** Compares with the committed baseline, or rewrites it under SIGIL_SNAPSHOT_UPDATE=1. */
function matchBaseline(name: string, actual: Record<string, string>): void {
  const file = path.join(BASELINE_DIR, `${name}.json`);
  if (UPDATE) {
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
