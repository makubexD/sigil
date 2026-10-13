/**
 * Tests for src/commands/update-deps.ts — a dependency `update` installs for an updated artifact is
 * recorded as a dependency (`picked: false`), so `prune` may later remove it once it is inlined.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAdd } from '../../dist-cli/commands/add';
import { installNewDependencies } from '../../dist-cli/commands/update-deps';
import { loadManifest } from '../../dist-cli/manifest';
import { getTarget } from '../../dist-cli/targets/index';
import { loadResolvedCatalog } from '../helpers/catalog';
import { CATALOG, PACKS } from '../helpers/install-scenario';
import { withTempDirAsync } from '../helpers/temp-dir';

const SKILL = 'csharp/cs-generate-tests';
const RULE = 'csharp/cs-testing';
const TARGET = 'claude';

describe('installNewDependencies', () => {
  it('should record a dependency it installs as not picked', async () => {
    await withTempDirAsync(async dir => {
      // Arrange
      const paths = { projectDir: dir, catalogDir: CATALOG, packs: PACKS };
      const quiet = { interactive: false, yes: true, overwrite: false, settingsLocal: false };
      await runAdd([`skill:${SKILL}`], {
        ...paths,
        ...quiet,
        target: TARGET,
        deps: false,
        dryRun: false,
      });
      const entries = loadManifest(dir).entries;
      const run = {
        entries,
        resolved: await loadResolvedCatalog(),
        target: getTarget(TARGET),
        installedIds: new Set(entries.map(e => e.id)),
      };

      // Act
      await installNewDependencies(run, { ...paths, force: false, dryRun: false });

      // Assert
      const rule = loadManifest(dir).entries.find(e => e.id === RULE);
      assert.deepEqual([rule?.dependentOf, rule?.picked], [[SKILL], false]);
    });
  });
});
