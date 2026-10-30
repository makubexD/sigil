/**
 * Hooks and MCP servers ship as their own generated Claude Code plugins — `hook-<basename>` and
 * `mcp-<basename>` — never inside a pack plugin, so a pack stays free of `hooks/hooks.json` and
 * `.mcp.json`. Each one reuses the scaffold path's fragment (the hook merge op, the portable MCP
 * server) so a plugin user gets exactly what `sigil add` would write.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { parsePacksConfig } from '../../dist-cli/packs-config';
import { resolveCatalog } from '../../dist-cli/resolve';
import { ClaudeCodeTarget } from '../../dist-cli/targets/claude-code';
import { buildHookConfigOps } from '../../dist-cli/targets/claude-code/config-scaffold';
import { resolveClaudeConfigDestination } from '../../dist-cli/targets/claude-code/config';
import { SigilError } from '../../dist-cli/errors';
import type { FileMap, Pack, ResolvedArtifact, ResolvedCatalog } from '../../dist-cli/types';
import { loadBundledCatalog } from '../helpers/catalog';
import { PACKS as BUNDLED_PACKS } from '../helpers/install-scenario';

const VERSION = '0.1.0';

/** The seven generated plugins of decision 1, in marketplace order. */
const CONFIG_PLUGINS = [
  'hook-protect-config',
  'hook-reviewer-bash-guard',
  'hook-worker-mode-guard',
  'mcp-ado',
  'mcp-context-mode',
  'mcp-filesystem',
  'mcp-maku-jam',
] as const;

/** The real `packs.yaml`, parsed once per call — no generated config plugin is listed there. */
function realPacks(): Pack[] {
  return parsePacksConfig(fs.readFileSync(BUNDLED_PACKS, 'utf8'), BUNDLED_PACKS).packs;
}

/** Compile the bundled catalog with the real `packs.yaml`. */
async function compileBundled(): Promise<{
  files: FileMap;
  resolved: ResolvedCatalog;
  packs: Pack[];
}> {
  const catalog = await loadBundledCatalog();
  const resolved = resolveCatalog(catalog);
  const packs = realPacks();
  const target = new ClaudeCodeTarget();
  const files = await target.compile(resolved, { version: VERSION, packs });
  return { files, resolved, packs };
}

/** Every output path under a plugin's folder. */
function pluginKeys(files: FileMap, pluginName: string): string[] {
  return Object.keys(files).filter(key => key.startsWith(`plugins/${pluginName}/`));
}

/** The `name`/`source` pair of every marketplace entry, in order. */
function marketplaceEntries(files: FileMap): Array<{ name: string; source: string }> {
  const marketplace = files['.claude-plugin/marketplace.json'];
  assert.ok(marketplace, 'marketplace.json is emitted');
  return JSON.parse(marketplace).plugins;
}

/** A pack made of explicit catalog ids, so a test names exactly what it holds. */
function packOf(name: string, artifacts: string[]): Pack {
  return { name, displayName: name, description: `The ${name} pack.`, artifacts };
}

/**
 * The resolved catalog with `shared/filesystem` cloned and restricted to Copilot. The shared
 * catalog is never mutated: the clone replaces the original in a fresh artifacts list and map.
 */
function withFilesystemOnCopilot(resolved: ResolvedCatalog): ResolvedCatalog {
  const base = resolved.byId.get('shared/filesystem');
  assert.ok(base, 'shared/filesystem is in the bundled catalog');
  const clone = structuredClone(base);
  clone.frontmatter.platforms = ['copilot'];
  return withArtifact(resolved, clone);
}

/** The resolved catalog with `artifact` replacing its id, or added when the id is new. */
function withArtifact(resolved: ResolvedCatalog, artifact: ResolvedArtifact): ResolvedCatalog {
  return {
    ...resolved,
    artifacts: resolved.byId.has(artifact.id)
      ? resolved.artifacts.map(other => (other.id === artifact.id ? artifact : other))
      : [...resolved.artifacts, artifact],
    byId: new Map(resolved.byId).set(artifact.id, artifact),
  };
}

/** The resolved catalog with `shared/ado` cloned to read exactly these environment variables. */
function withAdoVariables(resolved: ResolvedCatalog, names: string[]): ResolvedCatalog {
  const base = resolved.byId.get('shared/ado');
  assert.ok(base, 'shared/ado is in the bundled catalog');
  const clone = structuredClone(base);
  clone.frontmatter.server = { command: 'npx', args: names.map(name => `{sigil:env:${name}}`) };
  return withArtifact(resolved, clone);
}

/** The description of the generated `mcp-ado` plugin for a server reading these variables. */
async function adoDescriptionFor(names: string[]): Promise<string> {
  const resolved = resolveCatalog(await loadBundledCatalog());
  const files = await new ClaudeCodeTarget().compile(withAdoVariables(resolved, names), {
    version: VERSION,
    packs: realPacks(),
  });
  const manifest = files['plugins/mcp-ado/.claude-plugin/plugin.json'];
  assert.ok(manifest, 'mcp-ado ships a manifest');
  return JSON.parse(manifest).description;
}

describe('Claude plugin: hooks and MCP as generated plugins', () => {
  it('hook plugin holds only hooks', async () => {
    const { files } = await compileBundled();

    assert.deepEqual(
      pluginKeys(files, 'hook-protect-config').sort(),
      [
        'plugins/hook-protect-config/.claude-plugin/plugin.json',
        'plugins/hook-protect-config/hooks/hooks.json',
      ].sort(),
      'a hook plugin carries its manifest and hooks/hooks.json, nothing else',
    );
  });

  it('hook shape', async () => {
    const { files, resolved } = await compileBundled();
    const artifact = resolved.byId.get('shared/protect-config');
    assert.ok(artifact, 'shared/protect-config is in the bundled catalog');
    const [op] = buildHookConfigOps(
      artifact,
      resolveClaudeConfigDestination('hook', 'project', '/fake'),
    );
    assert.ok(op, 'buildHookConfigOps returns one merge op');

    const content = files['plugins/hook-protect-config/hooks/hooks.json'];
    assert.ok(content, 'hook-protect-config ships hooks/hooks.json');
    assert.deepEqual(
      JSON.parse(content),
      op.fragment,
      'the plugin fragment is the hook merge fragment sigil add writes',
    );
  });

  it('MCP plugin holds only config', async () => {
    const { files } = await compileBundled();

    assert.deepEqual(
      pluginKeys(files, 'mcp-ado').sort(),
      ['plugins/mcp-ado/.claude-plugin/plugin.json', 'plugins/mcp-ado/.mcp.json'].sort(),
      'an MCP plugin carries its manifest and .mcp.json, nothing else',
    );
  });

  it('env syntax', async () => {
    const { files } = await compileBundled();

    const content = files['plugins/mcp-ado/.mcp.json'];
    assert.ok(content, 'mcp-ado ships .mcp.json');
    assert.ok(
      content.includes('${ADO_ORG}'),
      'the org variable reaches the plugin in Claude syntax',
    );
    assert.ok(
      content.includes('${ADO_MCP_PERSONAL_TOKEN}'),
      'the PAT variable reaches the plugin in Claude syntax',
    );
    assert.ok(!content.includes('{sigil:env:'), 'no catalog env token survives into the plugin');
  });

  it('description names variables', async () => {
    const { files, resolved } = await compileBundled();

    const adoManifest = files['plugins/mcp-ado/.claude-plugin/plugin.json'];
    assert.ok(adoManifest, 'mcp-ado ships a manifest');
    const adoDescription: string = JSON.parse(adoManifest).description;
    assert.ok(adoDescription.includes('ADO_ORG'), 'the description names ADO_ORG');
    assert.ok(
      adoDescription.includes('ADO_MCP_PERSONAL_TOKEN'),
      'the description names ADO_MCP_PERSONAL_TOKEN',
    );

    const filesystemManifest = files['plugins/mcp-filesystem/.claude-plugin/plugin.json'];
    assert.ok(filesystemManifest, 'mcp-filesystem ships a manifest');
    const filesystemArtifact = resolved.byId.get('shared/filesystem');
    assert.ok(filesystemArtifact, 'shared/filesystem is in the bundled catalog');
    assert.equal(
      JSON.parse(filesystemManifest).description,
      filesystemArtifact.frontmatter.description,
      'an MCP with no env tokens keeps the catalog description verbatim',
    );
  });

  it('description lists one variable in the singular', async () => {
    assert.ok(
      (await adoDescriptionFor(['ONE'])).endsWith(' Requires the environment variable ONE.'),
    );
  });

  it('description lists three variables with commas and "and"', async () => {
    assert.ok(
      (await adoDescriptionFor(['ONE', 'TWO', 'THREE'])).endsWith(
        ' Requires the environment variables ONE, TWO and THREE.',
      ),
    );
  });

  it('all seven are listed', async () => {
    const { files } = await compileBundled();

    const entries = marketplaceEntries(files);
    for (const name of CONFIG_PLUGINS) {
      const entry = entries.find(candidate => candidate.name === name);
      assert.ok(entry, `${name} is a marketplace entry`);
      assert.equal(entry.source, `./plugins/${name}`, `${name} points at its plugin folder`);
    }
  });

  it('packs stay free of config', async () => {
    const { files, packs } = await compileBundled();

    for (const pack of packs) {
      const configKeys = pluginKeys(files, pack.name).filter(
        key => key.endsWith('hooks/hooks.json') || key.endsWith('.mcp.json'),
      );
      assert.deepEqual(configKeys, [], `pack ${pack.name} carries no hook or MCP config`);
    }
  });

  it('`essentials` is unchanged', async () => {
    const { files } = await compileBundled();

    assert.deepEqual(
      pluginKeys(files, 'essentials').sort(),
      [
        'plugins/essentials/.claude-plugin/plugin.json',
        'plugins/essentials/skills/explain-diff/SKILL.md',
      ].sort(),
      'essentials keeps its manifest and explain-diff, no config files',
    );
  });

  it('version is written', async () => {
    const { files } = await compileBundled();

    const manifest = files['plugins/hook-protect-config/.claude-plugin/plugin.json'];
    assert.ok(manifest, 'hook-protect-config ships a manifest');
    assert.equal(
      JSON.parse(manifest).version,
      VERSION,
      'a generated plugin carries the version passed to compile',
    );
  });

  it('`platforms` is honored', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);
    const original = resolved.byId.get('shared/filesystem');
    assert.ok(original, 'shared/filesystem is in the bundled catalog');
    const target = new ClaudeCodeTarget();
    const files = await target.compile(withFilesystemOnCopilot(resolved), {
      version: VERSION,
      packs: realPacks(),
    });

    assert.ok(
      !Object.keys(files).some(key => key.startsWith('plugins/mcp-filesystem/')),
      'an MCP restricted to copilot gets no Claude plugin',
    );
    assert.equal(
      original.frontmatter.platforms,
      undefined,
      'the shared resolved catalog is not mutated',
    );
  });

  it('name collision', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();

    await assert.rejects(
      target.compile(resolved, {
        version: VERSION,
        packs: [...realPacks(), packOf('hook-protect-config', ['shared/cli'])],
      }),
      (error: unknown) => {
        assert.ok(error instanceof SigilError, 'rejects with a SigilError');
        assert.ok(
          error.message.includes('hook-protect-config'),
          'the message names the colliding plugin',
        );
        return true;
      },
    );
  });

  it('two artifacts with one basename', async () => {
    const resolved = resolveCatalog(await loadBundledCatalog());
    const base = resolved.byId.get('shared/protect-config');
    assert.ok(base, 'shared/protect-config is in the bundled catalog');
    const sameBasename = { ...structuredClone(base), id: 'python/protect-config' };

    await assert.rejects(
      new ClaudeCodeTarget().compile(withArtifact(resolved, sameBasename), {
        version: VERSION,
        packs: realPacks(),
      }),
      (error: unknown) => {
        assert.ok(error instanceof SigilError, 'rejects with a SigilError');
        assert.ok(
          error.message.includes('hook-protect-config'),
          'the message names the colliding plugin',
        );
        return true;
      },
    );
  });

  it('a pack of only hooks and MCP servers gets no plugin', async () => {
    const resolved = resolveCatalog(await loadBundledCatalog());
    const files = await new ClaudeCodeTarget().compile(resolved, {
      version: VERSION,
      packs: [packOf('config-only', ['shared/protect-config', 'shared/filesystem'])],
    });

    assert.deepEqual(pluginKeys(files, 'config-only'), [], 'no plugin folder is written');
    assert.ok(
      !marketplaceEntries(files).some(entry => entry.name === 'config-only'),
      'the marketplace does not list it',
    );
  });

  it('homepage reaches a generated plugin', async () => {
    const resolved = resolveCatalog(await loadBundledCatalog());
    const files = await new ClaudeCodeTarget().compile(resolved, {
      version: VERSION,
      packs: realPacks(),
      homepage: 'https://example.test/home',
    });

    const manifest = files['plugins/mcp-ado/.claude-plugin/plugin.json'];
    assert.ok(manifest, 'mcp-ado ships a manifest');
    assert.equal(JSON.parse(manifest).author.url, 'https://example.test/home');
  });

  it('a configured marketplace identity reaches a generated plugin', async () => {
    const resolved = resolveCatalog(await loadBundledCatalog());
    const files = await new ClaudeCodeTarget().compile(resolved, {
      version: VERSION,
      packs: realPacks(),
      marketplace: { name: 'acme', owner: { name: 'Acme' }, license: 'Apache-2.0' },
    });

    const manifest = files['plugins/hook-protect-config/.claude-plugin/plugin.json'];
    assert.ok(manifest, 'hook-protect-config ships a manifest');
    const parsed = JSON.parse(manifest);
    assert.equal(parsed.author.name, 'Acme');
    assert.equal(parsed.license, 'Apache-2.0');
  });
});

describe('Claude plugin: pluginDependencies', () => {
  it('emitted', async () => {
    const { files } = await compileBundled();

    const manifest = files['plugins/deepseek-worker/.claude-plugin/plugin.json'];
    assert.ok(manifest, 'deepseek-worker ships a manifest');
    assert.deepEqual(
      JSON.parse(manifest).dependencies,
      ['hook-worker-mode-guard'],
      'the worker pack depends on the hook plugin generated for shared/worker-mode-guard',
    );
  });

  it('emitted under a configured marketplace identity', async () => {
    const resolved = resolveCatalog(await loadBundledCatalog());
    const files = await new ClaudeCodeTarget().compile(resolved, {
      version: VERSION,
      packs: realPacks(),
      marketplace: { name: 'acme', owner: { name: 'Acme' } },
    });

    const manifest = files['plugins/deepseek-worker/.claude-plugin/plugin.json'];
    assert.ok(manifest, 'deepseek-worker ships a manifest');
    assert.deepEqual(JSON.parse(manifest).dependencies, ['hook-worker-mode-guard']);
  });

  it('a dependency may name an MCP server', async () => {
    const resolved = resolveCatalog(await loadBundledCatalog());
    const pack: Pack = {
      ...packOf('needs-mcp', ['shared/cli', 'shared/filesystem']),
      pluginDependencies: ['shared/filesystem'],
    };
    const files = await new ClaudeCodeTarget().compile(resolved, {
      version: VERSION,
      packs: [pack],
    });

    const manifest = files['plugins/needs-mcp/.claude-plugin/plugin.json'];
    assert.ok(manifest, 'needs-mcp ships a manifest');
    assert.deepEqual(JSON.parse(manifest).dependencies, ['mcp-filesystem']);
  });

  it('starters stay opt-in', async () => {
    const { files, packs } = await compileBundled();

    const others = packs.filter(pack => pack.name !== 'deepseek-worker');
    assert.ok(others.length > 0, 'the bundled catalog has packs besides deepseek-worker');
    for (const pack of others) {
      const manifest = files[`plugins/${pack.name}/.claude-plugin/plugin.json`];
      assert.ok(manifest, `${pack.name} ships a manifest`);
      assert.ok(
        !('dependencies' in JSON.parse(manifest)),
        `pack ${pack.name} declares no dependencies`,
      );
    }
  });

  it('wrong kind', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();

    const wrongKind: Pack = {
      ...packOf('wrong-kind', ['shared/cli']),
      pluginDependencies: ['shared/cli'],
    };

    await assert.rejects(
      target.compile(resolved, { version: VERSION, packs: [...realPacks(), wrongKind] }),
      (error: unknown) => {
        assert.ok(error instanceof SigilError, 'rejects with a SigilError');
        assert.ok(error.message.includes('shared/cli'), 'the message names the dependency');
        return true;
      },
    );
  });

  it('none on generated', async () => {
    const { files } = await compileBundled();

    for (const name of CONFIG_PLUGINS) {
      const manifest = files[`plugins/${name}/.claude-plugin/plugin.json`];
      assert.ok(manifest, `${name} ships a manifest`);
      assert.ok(!('dependencies' in JSON.parse(manifest)), `${name} declares no dependencies`);
    }
  });
});
