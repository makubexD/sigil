/**
 * The neutral overlap module: which catalog ids an enabled marketplace plugin already delivers,
 * joined from the target's own plugin reader and the same contents the build writes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

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
import { getAllTargets } from '../dist-cli/targets/index';

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

/** A target whose plugin reader returns `result`. */
function stubTarget(result: EnabledPluginsResult): Target {
  return { enabledPlugins: () => result } as unknown as Target;
}

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
