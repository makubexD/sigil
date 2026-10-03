/**
 * Every pack in the real packs.yaml installs through the real install wizard, for both tools: no
 * error, something recorded, and every dependency a skill declares (`uses:`) installed with it.
 * Adding or changing a pack can't silently break the "Recommended" path a newcomer takes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import { loadAndValidate } from '../../dist-cli/cli-helpers';
import { loadManifest } from '../../dist-cli/manifest';
import { getTarget } from '../../dist-cli/targets/index';
import { supportsKind } from '../../dist-cli/targets/capabilities';
import { artifactTargetsPlatform } from '../../dist-cli/select';
import type { Artifact, Pack } from '../../dist-cli/types';
import { ENTER, mockClack } from '../helpers/clack-mock';
import type { MockDriver } from '../helpers/clack-mock';
import { CATALOG_DIR, PACKS_FILE, SCOPE, PACK_QUESTION, makeProject } from '../helpers/home-flow';
import { withTempDirAsync } from '../helpers/temp-dir';
import { fakeTTY } from '../helpers/tty';
import { TARGETS } from '../helpers/install-scenario';

const MAX_PROMPTS = 40;

interface SkillUses {
  uses?: { rules?: string[]; agents?: string[] };
}

/** The pack's artifacts that `targetName` can install and that target it (`platforms:`). */
function packMembers(pack: Pack, artifacts: readonly Artifact[], targetName: string): string[] {
  const target = getTarget(targetName);
  const ids = new Set(
    pack.artifacts ??
      artifacts
        .filter(a => (pack.languages ?? []).includes(a.frontmatter.language as string))
        .map(a => a.id),
  );
  return artifacts
    .filter(a => ids.has(a.id))
    .filter(a => supportsKind(target, a.kind) && artifactTargetsPlatform(a, targetName))
    .map(a => a.id);
}

/** Picks the pack path and the given pack; otherwise accepts what the wizard offers. */
function installPack(pack: string): MockDriver {
  let asked = 0;
  return prompt => {
    asked += 1;
    assert.ok(asked <= MAX_PROMPTS, `the wizard kept asking (last: ${prompt.message})`);
    if (prompt.message.startsWith(SCOPE)) return 'pack';
    if (prompt.message.startsWith(PACK_QUESTION)) return `pack:${pack}`;
    if (prompt.kind === 'multiselect') return prompt.options.map(o => o.value);
    if (prompt.kind === 'confirm') return true;
    return ENTER;
  };
}

describe('every real pack installs through the wizard', async () => {
  const { catalog, packsConfig } = await loadAndValidate(CATALOG_DIR, PACKS_FILE);
  const byId = new Map(catalog.artifacts.map(a => [a.id, a]));

  for (const pack of packsConfig.packs) {
    for (const target of TARGETS) {
      it(`should install ${pack.name} for ${target} with its dependencies`, async () => {
        await withTempDirAsync(async root => {
          const dir = path.join(root, 'work');
          makeProject(dir, [target]);
          const restoreTTY = fakeTTY();
          const restore = mockClack(installPack(pack.name));
          try {
            await runAdd([], {
              projectDir: dir,
              catalogDir: CATALOG_DIR,
              packs: PACKS_FILE,
              deps: true,
              dryRun: false,
              interactive: true,
              yes: false,
              overwrite: false,
              settingsLocal: false,
            });
          } finally {
            restore();
            restoreTTY();
          }
          const installed = new Set(loadManifest(dir).entries.map(e => e.id));
          const missing = packMembers(pack, catalog.artifacts, target).filter(
            id => !installed.has(id),
          );
          assert.deepEqual(missing, [], `${pack.name} for ${target} left members out`);
          for (const id of installed) {
            const uses = (byId.get(id)?.frontmatter as SkillUses | undefined)?.uses;
            for (const dep of [...(uses?.rules ?? []), ...(uses?.agents ?? [])]) {
              assert.ok(installed.has(dep), `${id} needs ${dep}, which was not installed`);
            }
          }
        });
      });
    }
  }
});
