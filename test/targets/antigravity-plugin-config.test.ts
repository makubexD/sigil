/**
 * Hooks and MCP servers ship as their own generated Antigravity plugins — `hook-<basename>` and
 * `mcp-<basename>` — never inside a pack plugin, so installing a pack never adds a hook. Each
 * one reuses the scaffold path's own op builder, so its config file holds exactly the fragment
 * `sigil add` merges into `.agents/`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyMerge } from '../../dist-cli/config-merge/apply';
import { buildAntigravityConfigPlugins } from '../../dist-cli/targets/antigravity/plugin-config';
import { buildAntigravityHookOps } from '../../dist-cli/targets/antigravity/hook-ops';
import {
  antigravityMcpSkipReason,
  buildAntigravityMcpOps,
} from '../../dist-cli/targets/antigravity/mcp-ops';
import type { ConfigMergeOp, ResolvedArtifact, ResolvedCatalog } from '../../dist-cli/types';
import { loadResolvedCatalog } from '../helpers/catalog';

const VERSION = '0.1.0';
const PROTECT_CONFIG = 'shared/protect-config';
const FILESYSTEM = 'shared/filesystem';

/** Fold every op into a fresh object, exactly as the plugin builder does. */
function fold(ops: ConfigMergeOp[]): Record<string, unknown> {
  return ops.reduce<Record<string, unknown>>((existing, op) => applyMerge(existing, op), {});
}

/** The resolved catalog with `artifact` replacing its id, or added when the id is new. */
function withArtifact(catalog: ResolvedCatalog, artifact: ResolvedArtifact): ResolvedCatalog {
  return {
    ...catalog,
    artifacts: catalog.byId.has(artifact.id)
      ? catalog.artifacts.map(other => (other.id === artifact.id ? artifact : other))
      : [...catalog.artifacts, artifact],
    byId: new Map(catalog.byId).set(artifact.id, artifact),
  };
}

/** A clone of `id` under a new id, with the given frontmatter overrides applied. */
function cloneAs(
  catalog: ResolvedCatalog,
  id: string,
  newId: string,
  frontmatter: Record<string, unknown> = {},
): ResolvedArtifact {
  const base = catalog.byId.get(id);
  assert.ok(base, `${id} is in the bundled catalog`);
  const clone = structuredClone(base);
  clone.id = newId;
  Object.assign(clone.frontmatter, frontmatter);
  return clone;
}

/** The generated plugins' names, in build order. */
function pluginNames(catalog: ResolvedCatalog): string[] {
  return buildAntigravityConfigPlugins(catalog, { version: VERSION }).map(plugin => plugin.name);
}

describe('Antigravity config plugins', () => {
  it('ships hook-protect-config with the fragment sigil add writes to .agents/hooks.json', async () => {
    const catalog = await loadResolvedCatalog();
    const plugin = buildAntigravityConfigPlugins(catalog, { version: VERSION }).find(
      candidate => candidate.name === 'hook-protect-config',
    );
    assert.ok(plugin, 'the real catalog generates hook-protect-config');

    assert.deepEqual(
      Object.keys(plugin.files).sort(),
      ['plugins/hook-protect-config/hooks.json', 'plugins/hook-protect-config/plugin.json'],
      'a hook plugin carries its manifest and hooks.json, nothing else',
    );

    const artifact = catalog.byId.get(PROTECT_CONFIG);
    assert.ok(artifact, `${PROTECT_CONFIG} is in the bundled catalog`);
    const content = plugin.files['plugins/hook-protect-config/hooks.json'];
    assert.ok(content, 'hook-protect-config ships hooks.json');
    assert.deepEqual(
      JSON.parse(content),
      fold(buildAntigravityHookOps(artifact, 'project')),
      'the plugin file is the hook fragment the scaffold merges',
    );
    assert.equal(content, content.trimEnd() + '\n', 'exactly one trailing newline');

    const manifest = plugin.files['plugins/hook-protect-config/plugin.json'];
    assert.ok(manifest, 'hook-protect-config ships a manifest');
    assert.equal(JSON.parse(manifest).name, 'hook-protect-config');
  });

  it('skips a hook restricted to another platform', async () => {
    const catalog = withArtifact(
      await loadResolvedCatalog(),
      cloneAs(await loadResolvedCatalog(), PROTECT_CONFIG, 'shared/claude-only-hook', {
        platforms: ['claude'],
      }),
    );

    assert.ok(!pluginNames(catalog).includes('hook-claude-only-hook'));
  });

  it('writes an MCP plugin and names the environment variable it needs', async () => {
    const catalog = withArtifact(
      await loadResolvedCatalog(),
      cloneAs(await loadResolvedCatalog(), FILESYSTEM, 'shared/env-server', {
        server: {
          command: 'npx',
          args: ['-y', 'server-filesystem'],
          env: { API_TOKEN: '{sigil:env:API_TOKEN}' },
        },
      }),
    );
    const plugin = buildAntigravityConfigPlugins(catalog, { version: VERSION }).find(
      candidate => candidate.name === 'mcp-env-server',
    );
    assert.ok(plugin, 'an MCP artifact with an identity env entry gets a plugin');

    const artifact = catalog.byId.get('shared/env-server');
    assert.ok(artifact);
    const content = plugin.files['plugins/mcp-env-server/mcp_config.json'];
    assert.ok(content, 'mcp-env-server ships mcp_config.json');
    assert.deepEqual(
      JSON.parse(content),
      fold(buildAntigravityMcpOps(artifact, 'project')),
      'the plugin file is the MCP fragment the scaffold merges',
    );

    const manifest = plugin.files['plugins/mcp-env-server/plugin.json'];
    assert.ok(manifest);
    assert.ok(
      (JSON.parse(manifest).description as string).endsWith(
        'Requires the environment variable API_TOKEN.',
      ),
    );
  });

  it('skips an MCP artifact its skip reason refuses', async () => {
    const catalog = withArtifact(
      await loadResolvedCatalog(),
      cloneAs(await loadResolvedCatalog(), FILESYSTEM, 'shared/refused-server', {
        server: { command: 'npx', args: ['{sigil:env:NEEDS_TOKEN}'] },
      }),
    );
    const artifact = catalog.byId.get('shared/refused-server');
    assert.ok(artifact);
    assert.ok(antigravityMcpSkipReason(artifact) !== undefined, 'the fixture is refused');

    assert.ok(!pluginNames(catalog).includes('mcp-refused-server'));
  });
});
