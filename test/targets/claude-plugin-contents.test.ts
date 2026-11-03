/**
 * What each Claude Code marketplace plugin holds. Computed from the same pack membership and
 * config-plugin selection the build writes, so the duplicate guard cannot disagree with
 * `.claude-plugin/marketplace.json`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { parsePacksConfig } from '../../dist-cli/packs-config';
import { resolveCatalog } from '../../dist-cli/resolve';
import { ClaudeCodeTarget } from '../../dist-cli/targets/claude-code';
import { marketplacePluginContents } from '../../dist-cli/targets/claude-code/plugin-contents';
import type { Pack, ResolvedArtifact, ResolvedCatalog } from '../../dist-cli/types';
import { loadBundledCatalog } from '../helpers/catalog';
import { PACKS as BUNDLED_PACKS } from '../helpers/install-scenario';

const VERSION = '0.1.0';

/** The real `packs.yaml`, parsed once per call. */
function realPacks(): Pack[] {
  return parsePacksConfig(fs.readFileSync(BUNDLED_PACKS, 'utf8'), BUNDLED_PACKS).packs;
}

/** A resolved artifact with only the fields a test cares about. */
function artifact(
  id: string,
  kind: ResolvedArtifact['kind'],
  extra: Partial<ResolvedArtifact> = {},
): ResolvedArtifact {
  return { id, kind, filePath: `${id}.md`, frontmatter: {}, body: '', ...extra };
}

/** A resolved catalog holding exactly `artifacts`. */
function catalogOf(artifacts: ResolvedArtifact[]): ResolvedCatalog {
  return {
    artifacts,
    byId: new Map(artifacts.map(a => [a.id, a])),
    languages: new Map(),
  };
}

/** A pack made of explicit catalog ids. */
function packOf(name: string, extra: Partial<Pack> = {}): Pack {
  return { name, displayName: name, description: `The ${name} pack.`, ...extra };
}

describe('marketplacePluginContents', () => {
  it('should drop a pluginExclude id from the pack key', () => {
    const a = artifact('shared/a', 'skill');
    const b = artifact('shared/b', 'skill');
    const pack = packOf('explicit', {
      artifacts: ['shared/a', 'shared/b'],
      pluginExclude: ['shared/b'],
    });

    const contents = marketplacePluginContents(catalogOf([a, b]), [pack]);

    assert.deepEqual(contents.get('explicit'), ['shared/a']);
  });

  it('should include a shared agent a pack skill uses', () => {
    const sharedAgent = artifact('shared/shared-agent', 'agent');
    const skill = artifact('shared/skill', 'skill', {
      resolvedAgentIds: ['shared/shared-agent'],
    });
    const pack = packOf('uses-shared', { artifacts: ['shared/skill'] });

    const contents = marketplacePluginContents(catalogOf([skill, sharedAgent]), [pack]);

    assert.deepEqual(
      contents.get('uses-shared'),
      ['shared/shared-agent', 'shared/skill'],
      'the shared agent joins the pack plugin its skill pulls in',
    );
  });

  it('should map the bundled hook to its generated plugin', async () => {
    const resolved = resolveCatalog(await loadBundledCatalog());

    const contents = marketplacePluginContents(resolved, realPacks());

    assert.deepEqual(contents.get('hook-protect-config'), ['shared/protect-config']);
  });

  it('should give a pack of only MCP artifacts no key', () => {
    const server = artifact('shared/server', 'mcp');
    const pack = packOf('config-only', { artifacts: ['shared/server'] });

    const contents = marketplacePluginContents(catalogOf([server]), [pack]);

    assert.ok(!contents.has('config-only'), 'a pack the plugin channel cannot carry is left out');
  });

  it('should match the build marketplace plugin names and order', async () => {
    const resolved = resolveCatalog(await loadBundledCatalog());
    const packs = realPacks();
    const files = await new ClaudeCodeTarget().compile(resolved, { version: VERSION, packs });
    const marketplace = files['.claude-plugin/marketplace.json'];
    assert.ok(marketplace, 'marketplace.json is emitted');
    const names: string[] = JSON.parse(marketplace).plugins.map(
      (entry: { name: string }) => entry.name,
    );

    const contents = marketplacePluginContents(resolved, packs);

    assert.deepEqual([...contents.keys()], names);
  });
});
