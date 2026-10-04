/**
 * A literal one provider flags `forbidElsewhere` (Claude's `CLAUDE.md`) must stop `build` and `add`
 * for every other provider, through `contractsFor` (src/targets/all-emit-specs.ts). This drives the
 * real commands, so it fails if either goes back to a target's raw `outputContracts`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runBuild } from '../../dist-cli/commands/build';
import { runAdd } from '../../dist-cli/commands/add';
import { withTempDirAsync } from '../helpers/temp-dir';

const SKILL_ID = 'shared/leaky';
const LEAKY_SKILL =
  '---\nid: shared/leaky\nkind: skill\nname: leaky\ntitle: Leaky\n' +
  'description: A probe skill. Use when probing.\n---\n\nRead CLAUDE.md before you start.\n';
const PACKS =
  'packs:\n  - name: probe\n    displayName: Probe\n    description: A probe pack.\n    artifacts: [shared/leaky]\n';

/** Writes the one-skill catalog and its packs.yaml under `root`. */
function seedCatalog(root: string): { catalogDir: string; packs: string } {
  const catalogDir = path.join(root, 'catalog');
  const skillDir = path.join(catalogDir, 'shared', 'skills', 'leaky');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), LEAKY_SKILL);
  const packs = path.join(root, 'packs.yaml');
  fs.writeFileSync(packs, PACKS);
  return { catalogDir, packs };
}

function add(root: string, target: string, seeded: { catalogDir: string; packs: string }) {
  const projectDir = path.join(root, `project-${target}`);
  fs.mkdirSync(projectDir, { recursive: true });
  return runAdd([`skill:${SKILL_ID}`], {
    projectDir,
    ...seeded,
    target,
    deps: true,
    dryRun: false,
    interactive: false,
    yes: true,
    overwrite: false,
    settingsLocal: false,
  });
}

describe("another provider's flagged literal", () => {
  it('should stop build for copilot and pass it for claude', async () => {
    await withTempDirAsync(async root => {
      const seeded = seedCatalog(root);
      const outDir = path.join(root, 'dist');
      await assert.rejects(
        runBuild({ target: 'copilot', ...seeded, outDir }),
        /output-conformance/,
      );
      await runBuild({ target: 'claude', ...seeded, outDir });
    });
  });

  it('should stop add for copilot and pass it for claude', async () => {
    await withTempDirAsync(async root => {
      const seeded = seedCatalog(root);
      await assert.rejects(add(root, 'copilot', seeded), /CLAUDE\.md|conformance|contract/i);
      await add(root, 'claude', seeded);
      assert.ok(
        fs.existsSync(path.join(root, 'project-claude', '.claude', 'skills', 'leaky', 'SKILL.md')),
      );
    });
  });
});
