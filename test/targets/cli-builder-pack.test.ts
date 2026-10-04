/**
 * The `cli-builder` pack ships `shared/cli` and `shared/wizard` as a Claude plugin with everything
 * they need: the skills' per-stack reference files, their rules folded in, and both auditor agents
 * preloading their skill. Before this pack, no plugin carried them at all.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAndValidate } from '../../dist-cli/cli-helpers';
import { resolveCatalog } from '../../dist-cli/resolve';
import { ClaudeCodeTarget } from '../../dist-cli/targets/claude-code';
import { CATALOG_DIR, PACKS_FILE } from '../helpers/home-flow';

const PLUGIN = 'plugins/cli-builder';
const STACKS = ['dotnet', 'go', 'node-ts', 'python', 'rust'];

describe('cli-builder pack', () => {
  it('should ship both skills, their stack references and both auditors', async () => {
    const { catalog, packsConfig } = await loadAndValidate(CATALOG_DIR, PACKS_FILE);
    const files = await new ClaudeCodeTarget().compile(resolveCatalog(catalog), {
      version: '0.0.0',
      packs: packsConfig.packs,
    });
    for (const skill of ['cli', 'wizard']) {
      assert.ok(files[`${PLUGIN}/skills/${skill}/SKILL.md`], `${skill} SKILL.md`);
      for (const stack of STACKS) {
        assert.ok(
          files[`${PLUGIN}/skills/${skill}/references/stack-${stack}.md`],
          `${skill} ${stack}`,
        );
      }
      const auditor = files[`${PLUGIN}/agents/${skill}-auditor.md`];
      assert.ok(auditor, `${skill}-auditor agent`);
      assert.match(auditor, new RegExp(`^skills:\\n {2}- ${skill}$`, 'm'));
    }
  });
});
