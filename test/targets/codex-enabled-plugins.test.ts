/**
 * Tests for the Codex enabled-plugin reader (src/targets/codex/enabled-plugins.ts): a plugin is
 * installed only when its cache folder under `$CODEX_HOME/plugins/cache/<marketplace>/` exists and
 * `config.toml` holds its `plugins."<name>@<marketplace>"` table (decision 7,
 * docs/plan-complement-follow-ups.md). Every test passes `vars` explicitly, so the real
 * `CODEX_HOME` is never read.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCodexEnabledPlugins } from '../../dist-cli/targets/codex/enabled-plugins';
import type { EnabledPluginsEnv } from '../../dist-cli/types';
import { pluginOverlaps } from '../../dist-cli/plugin-overlap';
import { parsePacksConfig } from '../../dist-cli/packs-config';
import { getTarget } from '../../dist-cli/targets/index';
import { loadResolvedCatalog } from '../helpers/catalog';
import { PACKS } from '../helpers/install-scenario';

/** A temporary home, removed after the test. */
function tempHome(): { homeDir: string; cleanup: () => void } {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-codex-plugins-'));
  return { homeDir, cleanup: () => fs.rmSync(homeDir, { recursive: true, force: true }) };
}

/** The default Codex home inside `homeDir`. */
const codexRoot = (homeDir: string) => path.join(homeDir, '.codex');

/** The marketplace cache folder of `root`. */
const cachePath = (root: string) => path.join(root, 'plugins', 'cache', 'sigil');

/** Creates the empty plugin folder `name` under `root`'s marketplace cache. */
function installPlugin(root: string, name: string): void {
  fs.mkdirSync(path.join(cachePath(root), name), { recursive: true });
}

/** Writes `root`'s `config.toml`. */
function writeConfig(root: string, text: string): void {
  fs.writeFileSync(path.join(root, 'config.toml'), text);
}

/** The reader environment; `vars` is always explicit so the real environment is never read. */
function env(homeDir: string, vars: Record<string, string | undefined> = {}): EnabledPluginsEnv {
  return { projectDir: homeDir, homeDir, marketplace: 'sigil', vars };
}

describe('readCodexEnabledPlugins', () => {
  it('(a) a folder counts only with its plugins table in config.toml', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      installPlugin(codexRoot(homeDir), 'alpha');
      assert.deepEqual(readCodexEnabledPlugins(env(homeDir)), { plugins: [], warnings: [] });

      writeConfig(codexRoot(homeDir), 'model = "gpt-5"\n');
      assert.deepEqual(readCodexEnabledPlugins(env(homeDir)), { plugins: [], warnings: [] });

      writeConfig(codexRoot(homeDir), '[plugins."alpha@sigil"]\n');
      assert.deepEqual(readCodexEnabledPlugins(env(homeDir)), {
        plugins: [{ name: 'alpha', source: '~/.codex/plugins/cache/sigil/alpha' }],
        warnings: [],
      });
    } finally {
      cleanup();
    }
  });

  it('(b) an explicit enabled = false is not counted', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      installPlugin(codexRoot(homeDir), 'alpha');
      writeConfig(codexRoot(homeDir), '[plugins."alpha@sigil"]\nenabled = false\n');
      assert.deepEqual(readCodexEnabledPlugins(env(homeDir)), { plugins: [], warnings: [] });
    } finally {
      cleanup();
    }
  });

  it('(c) plugins._default.enabled = false with one explicit true keeps only that one', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      installPlugin(codexRoot(homeDir), 'alpha');
      installPlugin(codexRoot(homeDir), 'beta');
      writeConfig(
        codexRoot(homeDir),
        [
          '[plugins._default]',
          'enabled = false',
          '',
          '[plugins."alpha@sigil"]',
          'enabled = true',
          '',
        ].join('\n'),
      );
      assert.deepEqual(readCodexEnabledPlugins(env(homeDir)), {
        plugins: [{ name: 'alpha', source: '~/.codex/plugins/cache/sigil/alpha' }],
        warnings: [],
      });
    } finally {
      cleanup();
    }
  });

  it('(d) CODEX_HOME moves the cache and config.toml', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      const codexHome = path.join(homeDir, 'custom-codex');
      installPlugin(codexHome, 'alpha');
      writeConfig(codexHome, '[plugins."alpha@sigil"]\n');

      assert.deepEqual(readCodexEnabledPlugins(env(homeDir, { CODEX_HOME: codexHome })), {
        plugins: [{ name: 'alpha', source: '~/custom-codex/plugins/cache/sigil/alpha' }],
        warnings: [],
      });
      assert.deepEqual(readCodexEnabledPlugins(env(homeDir)), { plugins: [], warnings: [] });
    } finally {
      cleanup();
    }
  });

  it('(e) invalid TOML is one warning, and the installed plugins are counted', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      installPlugin(codexRoot(homeDir), 'alpha');
      installPlugin(codexRoot(homeDir), 'beta');
      writeConfig(codexRoot(homeDir), '[plugins."alpha@sigil"\n');

      const result = readCodexEnabledPlugins(env(homeDir));

      assert.equal(result.warnings.length, 1);
      assert.match(result.warnings[0] ?? '', /^~\/\.codex\/config\.toml: /);
      assert.deepEqual(
        result.plugins.map(plugin => plugin.name),
        ['alpha', 'beta'],
      );
    } finally {
      cleanup();
    }
  });

  it('(f) a symlinked plugin folder is skipped', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      const root = codexRoot(homeDir);
      fs.mkdirSync(cachePath(root), { recursive: true });
      const real = path.join(homeDir, 'real-plugin');
      fs.mkdirSync(real);
      fs.symlinkSync(real, path.join(cachePath(root), 'linked'), 'dir');
      writeConfig(root, '[plugins."linked@sigil"]\n');

      assert.deepEqual(readCodexEnabledPlugins(env(homeDir)), { plugins: [], warnings: [] });
    } finally {
      cleanup();
    }
  });

  it('(g) through pluginOverlaps, typescript-starter yields its skill ids and no agent id', async () => {
    const { homeDir, cleanup } = tempHome();
    try {
      installPlugin(codexRoot(homeDir), 'typescript-starter');
      writeConfig(codexRoot(homeDir), '[plugins."typescript-starter@sigil"]\n');

      const catalog = await loadResolvedCatalog();
      const packs = parsePacksConfig(fs.readFileSync(PACKS, 'utf8'), PACKS).packs;
      const { overlaps } = pluginOverlaps(getTarget('codex'), catalog, packs, env(homeDir));

      assert.ok(overlaps.has('typescript/ts-document'));
      assert.ok(overlaps.has('typescript/ts-generate-tests'));
      assert.ok(overlaps.has('typescript/ts-release'));
      assert.ok(!overlaps.has('typescript/ts-code-reviewer'));
      for (const id of overlaps.keys()) {
        assert.equal(catalog.byId.get(id)?.kind, 'skill', `${id} is a skill`);
      }
    } finally {
      cleanup();
    }
  });
});
