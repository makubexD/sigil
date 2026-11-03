/**
 * The neutral overlap module: which catalog ids an enabled marketplace plugin already delivers,
 * joined from the target's own plugin reader and the same contents the build writes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_MARKETPLACE_NAME,
  formatPluginOverlap,
  marketplaceName,
  pluginOverlaps,
} from '../dist-cli/plugin-overlap';
import type {
  EnabledPluginsEnv,
  EnabledPluginsResult,
  Pack,
  ResolvedArtifact,
  ResolvedCatalog,
  Target,
} from '../dist-cli/types';
import { getAllTargets, getTarget } from '../dist-cli/targets/index';

const ENV: EnabledPluginsEnv = {
  projectDir: '/tmp/project',
  homeDir: '/tmp/home',
  marketplace: 'sigil',
};

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

/** A target whose plugin reader returns `result`, reading Claude's plugin contents. */
function stubTarget(result: EnabledPluginsResult): Target {
  return { enabledPlugins: () => result, pluginContentsFrom: 'claude' } as unknown as Target;
}

/** A temporary home, removed after the test. */
function tempHome(): { homeDir: string; cleanup: () => void } {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-plugin-overlap-'));
  return { homeDir, cleanup: () => fs.rmSync(homeDir, { recursive: true, force: true }) };
}

/** Install a Copilot CLI plugin folder under `~/.copilot/installed-plugins/sigil/`. */
function installCopilotPlugin(homeDir: string, plugin: string): void {
  fs.mkdirSync(path.join(homeDir, '.copilot', 'installed-plugins', 'sigil', plugin), {
    recursive: true,
  });
}

const homeEnv = (homeDir: string): EnabledPluginsEnv => ({
  projectDir: homeDir,
  homeDir,
  marketplace: 'sigil',
});

describe('pluginOverlaps', () => {
  it('should return nothing for a target that reads no plugin state', () => {
    const target = {} as unknown as Target;

    // A catalog of `null` proves the contents are never computed on this path.
    const result = pluginOverlaps(target, null as unknown as ResolvedCatalog, [] as Pack[], ENV);

    assert.equal(result.overlaps.size, 0);
    assert.deepEqual(result.warnings, []);
  });

  it('should map every id of one enabled pack plugin to that plugin', () => {
    const a = artifact('shared/a', 'skill');
    const b = artifact('shared/b', 'skill');
    const catalog = catalogOf([a, b]);
    const packs = [packOf('essentials', { artifacts: ['shared/a', 'shared/b'] })];
    const target = stubTarget({
      plugins: [{ name: 'essentials', source: '.claude/settings.json' }],
      warnings: [],
    });

    const { overlaps } = pluginOverlaps(target, catalog, packs, ENV);

    assert.deepEqual(
      [...overlaps.entries()],
      [
        [
          'shared/a',
          { plugin: 'essentials', marketplace: 'sigil', source: '.claude/settings.json' },
        ],
        [
          'shared/b',
          { plugin: 'essentials', marketplace: 'sigil', source: '.claude/settings.json' },
        ],
      ],
    );
  });

  it('should ignore an enabled name the contents do not hold', () => {
    const a = artifact('shared/a', 'skill');
    const packs = [packOf('essentials', { artifacts: ['shared/a'] })];
    const target = stubTarget({
      plugins: [{ name: 'renamed-away', source: '.claude/settings.json' }],
      warnings: [],
    });

    const { overlaps } = pluginOverlaps(target, catalogOf([a]), packs, ENV);

    assert.equal(overlaps.size, 0);
  });

  it('should keep the first plugin in marketplace order for a shared id', () => {
    const a = artifact('shared/a', 'skill');
    const packs = [
      packOf('essentials', { artifacts: ['shared/a'] }),
      packOf('extras', { artifacts: ['shared/a'] }),
    ];
    // The reader lists the later pack first; marketplace order still decides.
    const target = stubTarget({
      plugins: [
        { name: 'extras', source: '.claude/settings.json' },
        { name: 'essentials', source: '~/.claude/settings.json' },
      ],
      warnings: [],
    });

    const { overlaps } = pluginOverlaps(target, catalogOf([a]), packs, ENV);

    assert.deepEqual(overlaps.get('shared/a'), {
      plugin: 'essentials',
      marketplace: 'sigil',
      source: '~/.claude/settings.json',
    });
  });

  it('should map only the hook id when its generated plugin is enabled', () => {
    const guard = artifact('shared/guard', 'hook');
    const other = artifact('shared/other', 'skill');
    const target = stubTarget({
      plugins: [{ name: 'hook-guard', source: '.claude/settings.json' }],
      warnings: [],
    });

    const { overlaps } = pluginOverlaps(target, catalogOf([guard, other]), [], ENV);

    assert.deepEqual([...overlaps.keys()], ['shared/guard']);
    assert.deepEqual(overlaps.get('shared/guard'), {
      plugin: 'hook-guard',
      marketplace: 'sigil',
      source: '.claude/settings.json',
    });
  });

  it('should pass the reader warnings through unchanged', () => {
    const warnings = ['could not read .claude/settings.json', 'second problem'];
    const target = stubTarget({ plugins: [], warnings });

    const result = pluginOverlaps(target, catalogOf([]), [], ENV);

    assert.deepEqual(result.warnings, warnings);
  });

  it('should leave the marketplace out when the reader installs plugins outside one', () => {
    const a = artifact('shared/a', 'skill');
    const packs = [packOf('essentials', { artifacts: ['shared/a'] })];
    const target = stubTarget({
      plugins: [{ name: 'essentials', source: '.agents/plugins/essentials' }],
      warnings: [],
      marketplace: false,
    });

    const { overlaps } = pluginOverlaps(target, catalogOf([a]), packs, ENV);
    const overlap = overlaps.get('shared/a');

    assert.ok(overlap);
    assert.equal('marketplace' in overlap, false);
    assert.deepEqual(overlap, { plugin: 'essentials', source: '.agents/plugins/essentials' });
  });
});

describe('pluginOverlaps for a real target', () => {
  it('(a) should not count a hook Copilot cannot run from a plugin', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      installCopilotPlugin(homeDir, 'hook-protect-config');
      const catalog = catalogOf([artifact('shared/protect-config', 'hook')]);

      const { overlaps } = pluginOverlaps(getTarget('copilot'), catalog, [], homeEnv(homeDir));

      assert.equal(overlaps.size, 0);
    } finally {
      cleanup();
    }
  });

  it('(b) should count a pack plugin skill and leave out its hook and MCP ids', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      installCopilotPlugin(homeDir, 'essentials');
      const catalog = catalogOf([
        artifact('shared/skill-a', 'skill'),
        artifact('shared/guard', 'hook'),
        artifact('shared/server', 'mcp'),
      ]);
      const packs = [
        packOf('essentials', {
          artifacts: ['shared/skill-a', 'shared/guard', 'shared/server'],
        }),
      ];

      const { overlaps } = pluginOverlaps(getTarget('copilot'), catalog, packs, homeEnv(homeDir));

      assert.deepEqual([...overlaps.keys()], ['shared/skill-a']);
    } finally {
      cleanup();
    }
  });

  it('(c) should still count a hook on Claude, which loads every kind', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      fs.mkdirSync(path.join(homeDir, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(homeDir, '.claude', 'settings.json'),
        JSON.stringify({ enabledPlugins: { 'hook-protect-config@sigil': true } }),
      );
      const catalog = catalogOf([artifact('shared/protect-config', 'hook')]);

      const { overlaps } = pluginOverlaps(getTarget('claude'), catalog, [], homeEnv(homeDir));

      assert.deepEqual([...overlaps.keys()], ['shared/protect-config']);
    } finally {
      cleanup();
    }
  });

  it('(d) should return nothing and never compute the contents when the target names none', () => {
    const target = {
      enabledPlugins: () => ({
        plugins: [{ name: 'anything', source: 'state' }],
        warnings: [],
      }),
    } as unknown as Target;

    // A `null` catalog proves the contents are never computed on this path.
    const result = pluginOverlaps(target, null as unknown as ResolvedCatalog, [] as Pack[], ENV);

    assert.equal(result.overlaps.size, 0);
    assert.deepEqual(result.warnings, []);
  });
});

describe('formatPluginOverlap', () => {
  it('should give the shared wording', () => {
    assert.equal(
      formatPluginOverlap('shared/a', {
        plugin: 'essentials',
        marketplace: 'sigil',
        source: '.claude/settings.json',
      }),
      'shared/a is also delivered by plugin essentials@sigil (enabled in .claude/settings.json)',
    );
  });

  it('should drop the marketplace when there is none', () => {
    assert.equal(
      formatPluginOverlap('shared/a', {
        plugin: 'essentials',
        source: '.agents/plugins/essentials',
      }),
      'shared/a is also delivered by plugin essentials (enabled in .agents/plugins/essentials)',
    );
  });
});

describe('registered targets', () => {
  it('should define marketplacePluginContents on some registered target', () => {
    assert.ok(getAllTargets().some(target => target.marketplacePluginContents !== undefined));
  });
});

describe('marketplaceName', () => {
  it('should default to sigil and use a configured identity', () => {
    assert.equal(marketplaceName(undefined), 'sigil');
    assert.equal(marketplaceName(undefined), DEFAULT_MARKETPLACE_NAME);
    assert.equal(marketplaceName({ name: 'acme' }), 'acme');
  });
});

describe('pluginOverlaps platform slice', () => {
  it('should leave out a pack member whose platforms exclude the target that builds the plugin', () => {
    const everywhere = artifact('shared/skill-a', 'skill', { frontmatter: { name: 'skill-a' } });
    const claudeOnly = artifact('shared/skill-b', 'skill', {
      frontmatter: { name: 'skill-b', platforms: ['claude'] },
    });
    const catalog = catalogOf([everywhere, claudeOnly]);
    const pack = packOf('starter', { artifacts: [everywhere.id, claudeOnly.id] });
    const plugins = { plugins: [{ name: 'starter', source: 'state' }], warnings: [] };
    const readsFrom = (name: string): Target =>
      ({ enabledPlugins: () => plugins, pluginContentsFrom: name }) as unknown as Target;

    const fromAntigravity = pluginOverlaps(readsFrom('antigravity'), catalog, [pack], ENV);
    assert.deepEqual([...fromAntigravity.overlaps.keys()], ['shared/skill-a']);

    const fromClaude = pluginOverlaps(readsFrom('claude'), catalog, [pack], ENV);
    assert.deepEqual([...fromClaude.overlaps.keys()].sort(), ['shared/skill-a', 'shared/skill-b']);
  });
});
